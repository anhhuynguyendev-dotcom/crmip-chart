(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.CRMIPChart = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    gainEps: 1e-12,
    enableDrag: true,
    layout: {
      mode: 'force',
      width: 1200,
      height: 900,
      leftXRatio: 0.35,
      rightXRatio: 0.65,
    },
    format: {
      pctMinDisplay: 0.1,
      pctDecimals: 1,
      volDecimals: 1,
    },
  });

  function mergeOptions(userOptions) {
    const o = userOptions || {};
    return {
      gainEps: (typeof o.gainEps === 'number') ? o.gainEps : DEFAULTS.gainEps,
      enableDrag: (typeof o.enableDrag === 'boolean') ? o.enableDrag : DEFAULTS.enableDrag,
      layout: {
        mode: (o.layout && o.layout.mode) ? o.layout.mode : DEFAULTS.layout.mode,
        width: (o.layout && typeof o.layout.width === 'number') ? o.layout.width : DEFAULTS.layout.width,
        height: (o.layout && typeof o.layout.height === 'number') ? o.layout.height : DEFAULTS.layout.height,
        leftXRatio: (o.layout && typeof o.layout.leftXRatio === 'number') ? o.layout.leftXRatio : DEFAULTS.layout.leftXRatio,
        rightXRatio: (o.layout && typeof o.layout.rightXRatio === 'number') ? o.layout.rightXRatio : DEFAULTS.layout.rightXRatio,
      },
      format: {
        pctMinDisplay: (o.format && typeof o.format.pctMinDisplay === 'number') ? o.format.pctMinDisplay : DEFAULTS.format.pctMinDisplay,
        pctDecimals: (o.format && typeof o.format.pctDecimals === 'number') ? o.format.pctDecimals : DEFAULTS.format.pctDecimals,
        volDecimals: (o.format && typeof o.format.volDecimals === 'number') ? o.format.volDecimals : DEFAULTS.format.volDecimals,
      },
    };
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function toNodeId(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
    return undefined;
  }

  function normalizeData(data) {
    assert(data && typeof data === 'object', 'CRMIPChart.render: data is required');

    let nodes;
    if (Array.isArray(data.nodes)) {
      nodes = data.nodes.map(n => {
        assert(n && typeof n === 'object', 'Node must be an object');
        assert(typeof n.id === 'string' && n.id.length > 0, 'Node.id (string) is required');
        assert(n.type === 'Injector' || n.type === 'Producer', 'Node.type must be Injector|Producer');
        assert(typeof n.rate === 'number' && isFinite(n.rate), `Node.rate must be a number (${n.id})`);

        return {
          id: n.id,
          type: n.type,
          rate: n.rate,
          x: (typeof n.x === 'number') ? n.x : undefined,
          y: (typeof n.y === 'number') ? n.y : undefined,
          wc: (typeof n.wc === 'number') ? n.wc : undefined,
          oil: (typeof n.oil === 'number') ? n.oil : undefined,
        };
      });
    } else {
      assert(Array.isArray(data.injectors), 'CRMIPChart.render: provide data.nodes OR data.injectors');
      assert(Array.isArray(data.producers), 'CRMIPChart.render: provide data.nodes OR data.producers');

      const injectors = data.injectors.map(n => {
        assert(n && typeof n === 'object', 'Injector must be an object');
        assert(typeof n.id === 'string' && n.id.length > 0, 'Injector.id (string) is required');
        assert(typeof n.rate === 'number' && isFinite(n.rate), `Injector.rate must be a number (${n.id})`);
        return {
          id: n.id,
          type: 'Injector',
          rate: n.rate,
          x: (typeof n.x === 'number') ? n.x : undefined,
          y: (typeof n.y === 'number') ? n.y : undefined,
        };
      });

      const producers = data.producers.map(n => {
        assert(n && typeof n === 'object', 'Producer must be an object');
        assert(typeof n.id === 'string' && n.id.length > 0, 'Producer.id (string) is required');
        assert(typeof n.rate === 'number' && isFinite(n.rate), `Producer.rate must be a number (${n.id})`);
        return {
          id: n.id,
          type: 'Producer',
          rate: n.rate,
          x: (typeof n.x === 'number') ? n.x : undefined,
          y: (typeof n.y === 'number') ? n.y : undefined,
          wc: (typeof n.wc === 'number') ? n.wc : undefined,
          oil: (typeof n.oil === 'number') ? n.oil : undefined,
        };
      });

      nodes = injectors.concat(producers);
    }

    assert(Array.isArray(data.links), 'CRMIPChart.render: data.links must be an array');

    const links = data.links.map(l => {
      assert(l && typeof l === 'object', 'Link must be an object');

      const source = toNodeId(l.source) || toNodeId(l.injectorId);
      const target = toNodeId(l.target) || toNodeId(l.producerId);

      assert(typeof source === 'string' && source.length > 0, 'Link.source (string) or Link.injectorId is required');
      assert(typeof target === 'string' && target.length > 0, 'Link.target (string) or Link.producerId is required');

      const gain = (typeof l.gain === 'number') ? l.gain : ((typeof l.weight === 'number') ? l.weight : 0);

      return { source, target, gain };
    });

    return { nodes, links };
  }

  function createNodeMap(nodes) {
    const map = new Map();
    for (const d of nodes) {
      if (d.type === 'Producer') {
        d.liq = d.rate;
        d.oilM3 = d.oil;
        d.oilKT = (typeof d.oilM3 === 'number') ? ((d.oilM3 * 0.85) / 1000) : undefined;
      }
      map.set(d.id, d);
    }
    return map;
  }

  function normalizeLinksPerInjector(rawLinks, nodeMap, gainEps) {
    const sumGainBySource = new Map();

    for (const l of rawLinks) {
      const gain = (typeof l.gain === 'number') ? l.gain : 0;
      if (gain > gainEps) {
        sumGainBySource.set(l.source, (sumGainBySource.get(l.source) || 0) + gain);
      }
    }

    const links = [];
    for (let i = 0; i < rawLinks.length; i++) {
      const l = rawLinks[i];
      const source = nodeMap.get(l.source);
      const target = nodeMap.get(l.target);
      if (!source || !target) continue;

      const gain = (typeof l.gain === 'number') ? l.gain : 0;
      const sumGain = sumGainBySource.get(l.source) || 0;
      const normalizedWeight = (gain > gainEps && sumGain > 0) ? (gain / sumGain) : 0;
      const injVol = source.rate * normalizedWeight;

      links.push({
        id: `link-${i}`,
        source,
        target,
        gain,
        weight: normalizedWeight,
        injVol,
      });
    }

    return links;
  }

  function formatPct(weight, fmt) {
    const pct = weight * 100;
    if (!(pct > 0)) return '';
    if (pct < fmt.pctMinDisplay) return `<${fmt.pctMinDisplay}%`;
    return `${pct.toFixed(fmt.pctDecimals)}%`;
  }

  function render(container, data, options) {
    assert(global.d3, 'CRMIPChart.render requires D3 v7 to be loaded (global d3)');

    const el = (typeof container === 'string') ? document.querySelector(container) : container;
    assert(el instanceof HTMLElement, 'CRMIPChart.render: container not found');

    const opts = mergeOptions(options);
    const normalized = normalizeData(data);
    const nodesData = normalized.nodes;
    const rawLinks = normalized.links;

    el.innerHTML = '';

    const width = opts.layout.width;
    const height = opts.layout.height;

    const svg = global.d3.select(el).append('svg')
      .attr('class', 'crmip-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');
    const linkGroup = g.append('g').attr('class', 'layer-links');
    const labelGroup = g.append('g').attr('class', 'layer-labels');
    const nodeGroup = g.append('g').attr('class', 'layer-nodes');

    const defs = svg.append('defs');

    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 0).attr('refY', 0)
      .attr('markerWidth', 8).attr('markerHeight', 8)
      .attr('markerUnits', 'userSpaceOnUse')
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', getCssVar('--link-color', '#3b82f6'));

    defs.append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 0).attr('refY', 0)
      .attr('markerWidth', 10).attr('markerHeight', 10)
      .attr('markerUnits', 'userSpaceOnUse')
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', getCssVar('--link-highlight', '#2563eb'));

    const injGradient = defs.append('radialGradient')
      .attr('id', 'gradInj')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
    injGradient.append('stop').attr('offset', '0%').style('stop-color', '#38bdf8');
    injGradient.append('stop').attr('offset', '100%').style('stop-color', '#0284c7');

    const nodeMap = createNodeMap(nodesData);
    const links = normalizeLinksPerInjector(rawLinks, nodeMap, opts.gainEps);

    const rScale = global.d3.scaleSqrt().domain([0, 200]).range([30, 60]);
    const strokeScale = global.d3.scaleLinear().domain([0, 0.5]).range([1.5, 6]);

    const zoom = global.d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => g.attr('transform', event.transform));

    let currentMode = 'pan';
    let lockedNode = null;
    const isLocked = () => lockedNode !== null;

    svg.call(zoom);

    svg.on('click', () => {
      if (!isLocked()) return;
      lockedNode = null;
      resetHighlight();
    });

    const calculatePath = (d) => {
      const sourceX = d.source.x, sourceY = d.source.y;
      const targetX = d.target.x, targetY = d.target.y;
      const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
      const targetRadius = rScale(d.target.rate) + 8;
      const endX = targetX - Math.cos(angle) * targetRadius;
      const endY = targetY - Math.sin(angle) * targetRadius;
      return `M${sourceX},${sourceY}L${endX},${endY}`;
    };

    const calculateLabelTransform = (d) => {
      const mx = (d.source.x + d.target.x) / 2;
      const my = (d.source.y + d.target.y) / 2;
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90 || angle < -90) angle += 180;
      return `translate(${mx}, ${my}) rotate(${angle})`;
    };

    const linkWrappers = linkGroup.selectAll('g').data(links).enter().append('g');

    linkWrappers.append('path')
      .attr('class', 'link-underlay')
      .attr('d', d => calculatePath(d))
      .attr('stroke-width', d => strokeScale(d.weight) + 3);

    linkWrappers.append('path')
      .attr('class', 'link-visible')
      .attr('id', d => d.id)
      .attr('d', d => calculatePath(d))
      .attr('stroke-width', d => strokeScale(d.weight))
      .attr('marker-end', 'url(#arrow)');

    const labelWrappers = labelGroup.selectAll('g').data(links).enter().append('g')
      .attr('class', 'link-label-group')
      .attr('transform', d => calculateLabelTransform(d));

    labelWrappers.append('text')
      .attr('class', 'link-text')
      .attr('dy', -3)
      .text(d => d.weight > 0 ? `${formatPct(d.weight, opts.format)} - ${d.injVol.toFixed(opts.format.volDecimals)}m³` : '');

    linkWrappers.append('path')
      .attr('class', 'link-overlay')
      .attr('d', d => calculatePath(d))
      .attr('stroke-width', 20)
      .attr('stroke', 'transparent')
      .on('mouseover', function (_event, d) {
        if (isLocked()) return;
        global.d3.select(this.parentNode).select('.link-visible')
          .attr('stroke', getCssVar('--link-highlight', '#2563eb'))
          .attr('marker-end', 'url(#arrow-highlight)')
          .style('opacity', 1);
        highlightConnection(d);
      })
      .on('mouseout', function () {
        if (isLocked()) {
          highlightNode(lockedNode);
          return;
        }
        resetHighlight();
      });

    const nodes = nodeGroup.selectAll('g').data(nodesData).enter().append('g')
      .attr('class', 'node-group')
      .attr('transform', d => `translate(${d.x || width / 2},${d.y || height / 2})`)
      .on('click', function (event, d) {
        event.stopPropagation();
        if (lockedNode && lockedNode.id === d.id) {
          lockedNode = null;
          resetHighlight();
          return;
        }
        lockedNode = d;
        highlightNode(d);
      })
      .on('mouseover', function (event, d) {
        d.__hover = true;
        global.d3.select(this).attr('transform', `translate(${d.x},${d.y}) scale(1.1)`);
        if (!isLocked()) highlightNode(d);

        const tooltipEl = document.getElementById('tooltip');
        if (!tooltipEl) return;

        const tooltip = global.d3.select(tooltipEl);
        let content = `<div class="tooltip-header">${d.id} (${d.type})</div>`;
        if (d.type === 'Injector') {
          content += `<div class="tooltip-row"><span class="tooltip-label">Water Inj Rate:</span> <span class="tooltip-val" style="color:var(--inj-color)">${d.rate} m³</span></div>`;
        } else {
          content += `<div class="tooltip-row"><span class="tooltip-label">Liquid Rate:</span> <span class="tooltip-val">${d.rate} m³</span></div>`;
          content += `<div class="tooltip-row"><span class="tooltip-label">Oil Rate:</span> <span class="tooltip-val" style="color:var(--oil-color)">${d.oil ?? ''} m³</span></div>`;
          content += `<div class="tooltip-row"><span class="tooltip-label">Water Cut:</span> <span class="tooltip-val" style="color:var(--water-color)">${d.wc ?? ''}%</span></div>`;
        }

        tooltip.style('opacity', 1)
          .html(content)
          .style('left', (event.pageX + 20) + 'px')
          .style('top', (event.pageY - 20) + 'px');
      })
      .on('mouseout', function () {
        const tooltipEl = document.getElementById('tooltip');
        if (tooltipEl) global.d3.select(tooltipEl).style('opacity', 0);
      });

    const injNodes = nodes.filter(d => d.type === 'Injector');
    injNodes.append('circle')
      .attr('r', d => rScale(d.rate) + 3)
      .attr('fill', 'none')
      .attr('stroke', 'var(--inj-color)')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5);
    injNodes.append('circle')
      .attr('r', d => rScale(d.rate))
      .attr('fill', 'url(#gradInj)')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);
    injNodes.append('line').attr('x1', 0).attr('y1', -6).attr('x2', 0).attr('y2', 6).attr('stroke', '#fff').attr('stroke-width', 2);
    injNodes.append('line').attr('x1', -6).attr('y1', 0).attr('x2', 6).attr('y2', 0).attr('stroke', '#fff').attr('stroke-width', 2);

    const prodNodes = nodes.filter(d => d.type === 'Producer');
    prodNodes.each(function (d) {
      const r = rScale(d.rate);
      const wc = (typeof d.wc === 'number') ? d.wc : 0;
      const wcRad = (wc / 100) * 2 * Math.PI;

      const waterArc = global.d3.arc().innerRadius(0).outerRadius(r).startAngle(-Math.PI / 2 - wcRad).endAngle(-Math.PI / 2);
      const oilArc = global.d3.arc().innerRadius(0).outerRadius(r).startAngle(-Math.PI / 2).endAngle(-Math.PI / 2 + (2 * Math.PI - wcRad));

      global.d3.select(this).append('path').attr('d', waterArc).attr('fill', 'var(--water-color)').attr('stroke', 'none');
      global.d3.select(this).append('path').attr('d', oilArc).attr('fill', 'var(--oil-color)').attr('stroke', 'none');
      global.d3.select(this).append('circle').attr('r', r).attr('fill', 'none').attr('stroke', '#64748b').attr('stroke-opacity', 0.3).attr('stroke-width', 1);
    });

    nodes.each(function (d) {
      const gText = global.d3.select(this).append('g').attr('class', 'node-text-group');

      if (d.type === 'Producer') {
        const startY = -18;
        gText.append('text').attr('class', 'node-id').attr('dy', startY).text(d.id);
        gText.append('line').attr('class', 'node-divider').attr('x1', -20).attr('x2', 20).attr('y1', startY + 8).attr('y2', startY + 8);
        gText.append('text').attr('class', 'node-metric').attr('dy', startY + 22).style('fill', '#0f172a').text(d.rate);
        gText.append('text').attr('class', 'node-metric').attr('dy', startY + 36).style('fill', 'var(--oil-color)').text(d.oil ?? '');
        gText.append('text').attr('class', 'node-metric').attr('dy', startY + 50).style('fill', '#1e3a8a').text((typeof d.wc === 'number') ? `${d.wc}%` : '');
      } else {
        gText.append('text').attr('class', 'node-id').attr('dy', -8).text(d.id);
        gText.append('line').attr('class', 'node-divider').attr('x1', -15).attr('x2', 15).attr('y1', 2).attr('y2', 2);
        gText.append('text').attr('class', 'node-metric').attr('dy', 14).text(d.rate);
      }
    });

    function highlightConnection(d) {
      svg.selectAll('.node-group').classed('dimmed', true);
      svg.selectAll('.link-visible').classed('dimmed', true);
      svg.selectAll('.link-text').classed('dimmed', true);

      const wrappers = linkWrappers.filter(l => l === d);
      wrappers.select('.link-visible').classed('dimmed', false).style('opacity', 1);

      const labels = labelWrappers.filter(l => l === d);
      labels.select('.link-text').classed('dimmed', false).style('opacity', 1);

      svg.selectAll('.node-group')
        .filter(n => n.id === d.source.id || n.id === d.target.id)
        .classed('dimmed', false);
    }

    function highlightNode(d) {
      svg.selectAll('.node-group').classed('dimmed', true);
      svg.selectAll('.link-visible').classed('dimmed', true);
      svg.selectAll('.link-text').classed('dimmed', true);

      svg.selectAll('.node-group').filter(n => n.id === d.id).classed('dimmed', false);

      const connectedWrappers = linkWrappers.filter(l => l.source.id === d.id || l.target.id === d.id);
      connectedWrappers.select('.link-visible')
        .classed('dimmed', false)
        .attr('marker-end', 'url(#arrow-highlight)')
        .attr('stroke', getCssVar('--hover-color', '#f59e0b'))
        .style('opacity', 1);

      const connectedLabels = labelWrappers.filter(l => l.source.id === d.id || l.target.id === d.id);
      connectedLabels.select('.link-text')
        .classed('dimmed', false)
        .style('opacity', 1)
        .style('fill', getCssVar('--link-highlight', '#2563eb'));

      const neighborIds = new Set();
      connectedWrappers.each(l => { neighborIds.add(l.source.id); neighborIds.add(l.target.id); });
      svg.selectAll('.node-group').filter(n => neighborIds.has(n.id)).classed('dimmed', false);
    }

    function resetHighlight() {
      svg.selectAll('.dimmed').classed('dimmed', false);
      svg.selectAll('.link-visible')
        .attr('stroke', 'var(--link-color)')
        .attr('marker-end', 'url(#arrow)')
        .style('opacity', 0.5);
      svg.selectAll('.link-text').style('opacity', 0.9).style('fill', '#1e40af');
    }

    if (opts.enableDrag) {
      const drag = global.d3.drag()
        .filter((event) => currentMode === 'pan' && event.button === 0)
        .on('start', (event, d) => {
          if (!event.active && simulation) simulation.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active && simulation) simulation.alphaTarget(0);
          d.fx = event.x;
          d.fy = event.y;
        });
      nodes.call(drag);
    }

    function startSelection(event) {
      const p1 = global.d3.pointer(event);
      const selectionRect = svg.append('rect')
        .attr('class', 'selection-box')
        .attr('x', p1[0])
        .attr('y', p1[1])
        .attr('width', 0)
        .attr('height', 0);

      svg.on('mousemove.select', function (event2) {
        const p2 = global.d3.pointer(event2);
        const x = Math.min(p1[0], p2[0]);
        const y = Math.min(p1[1], p2[1]);
        const w = Math.abs(p1[0] - p2[0]);
        const h = Math.abs(p1[1] - p2[1]);
        selectionRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
      });

      svg.on('mouseup.select', function () {
        const transform = global.d3.zoomTransform(svg.node());
        const x = parseFloat(selectionRect.attr('x'));
        const y = parseFloat(selectionRect.attr('y'));
        const w = parseFloat(selectionRect.attr('width'));
        const h = parseFloat(selectionRect.attr('height'));
        const x0 = (x - transform.x) / transform.k;
        const y0 = (y - transform.y) / transform.k;
        const x1 = x0 + (w / transform.k);
        const y1 = y0 + (h / transform.k);

        nodeGroup.selectAll('.node-group')
          .classed('selected', d => d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1);

        selectionRect.remove();
        svg.on('mousemove.select', null).on('mouseup.select', null);
      });
    }

    let simulation = null;
    if (opts.layout.mode === 'force') {
      const LEFT_X = width * opts.layout.leftXRatio;
      const RIGHT_X = width * opts.layout.rightXRatio;

      simulation = global.d3.forceSimulation(nodesData)
        .force('link', global.d3.forceLink(links).id(d => d.id).distance(280).strength(0.25))
        .force('charge', global.d3.forceManyBody().strength(-800))
        .force('x', global.d3.forceX(d => d.type === 'Injector' ? LEFT_X : RIGHT_X).strength(0.14))
        .force('y', global.d3.forceY(height / 2).strength(0.08))
        .force('collision', global.d3.forceCollide().radius(d => rScale(d.rate) + 40).strength(1))
        .alpha(1)
        .on('tick', ticked);
    } else {
      for (const d of nodesData) {
        d.x = (typeof d.x === 'number') ? d.x : width / 2;
        d.y = (typeof d.y === 'number') ? d.y : height / 2;
      }
      ticked();
    }

    function ticked() {
      const margin = 80;
      for (const d of nodesData) {
        const r = rScale(d.rate) + 6;
        d.x = Math.max(margin + r, Math.min(width - margin - r, d.x));
        d.y = Math.max(margin + r, Math.min(height - margin - r, d.y));
      }

      nodes.attr('transform', d => {
        const s = d.__hover ? 1.1 : 1;
        return `translate(${d.x},${d.y}) scale(${s})`;
      });

      linkWrappers.selectAll('.link-underlay').attr('d', d => calculatePath(d));
      linkWrappers.selectAll('.link-visible').attr('d', d => calculatePath(d));
      linkWrappers.selectAll('.link-overlay').attr('d', d => calculatePath(d));
      labelWrappers.attr('transform', d => calculateLabelTransform(d));
    }

    function setMode(mode) {
      currentMode = (mode === 'select') ? 'select' : 'pan';

      if (currentMode === 'pan') {
        el.classList.remove('select-mode');
        svg.call(zoom);
        svg.on('mousedown.select', null);
      } else {
        el.classList.add('select-mode');
        svg.on('.zoom', null);
        svg.on('mousedown.select', startSelection);
      }
    }

    function zoomIn() {
      svg.transition().call(zoom.scaleBy, 1.2);
    }

    function zoomOut() {
      svg.transition().call(zoom.scaleBy, 0.8);
    }

    function resetZoom() {
      svg.transition().call(zoom.transform, global.d3.zoomIdentity);
    }

    function destroy() {
      if (simulation) simulation.stop();
      el.innerHTML = '';
    }

    setMode('pan');

    return {
      destroy,
      setMode,
      zoomIn,
      zoomOut,
      resetZoom,
      getSvgNode: () => svg.node(),
    };
  }

  function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) ? v.trim() : fallback;
  }

  class Injector {
    constructor(id, rate, extra) {
      const e = extra || {};
      this.id = id;
      this.type = 'Injector';
      this.rate = rate;
      this.x = (typeof e.x === 'number') ? e.x : undefined;
      this.y = (typeof e.y === 'number') ? e.y : undefined;
    }
  }

  class Producer {
    constructor(id, rate, extra) {
      const e = extra || {};
      this.id = id;
      this.type = 'Producer';
      this.rate = rate;
      this.oil = (typeof e.oil === 'number') ? e.oil : undefined;
      this.wc = (typeof e.wc === 'number') ? e.wc : undefined;
      this.x = (typeof e.x === 'number') ? e.x : undefined;
      this.y = (typeof e.y === 'number') ? e.y : undefined;
    }
  }

  class Link {
    constructor(injector, producer, gain) {
      const source = toNodeId(injector);
      const target = toNodeId(producer);
      assert(typeof source === 'string' && source.length > 0, 'Link: injector id (string) or node with .id is required');
      assert(typeof target === 'string' && target.length > 0, 'Link: producer id (string) or node with .id is required');
      this.source = source;
      this.target = target;
      this.gain = gain;
    }
  }

  function injector(id, rate, extra) {
    return new Injector(id, rate, extra);
  }

  function producer(id, rate, extra) {
    return new Producer(id, rate, extra);
  }

  function link(injectorId, producerId, gain) {
    return new Link(injectorId, producerId, gain);
  }

  const api = {
    render,
    node: { injector, producer },
    link,
    Injector,
    Producer,
    Link,
  };

  if (global && typeof global === 'object') {
    global.CRMIPChart = api;
  }

  return api;
});
