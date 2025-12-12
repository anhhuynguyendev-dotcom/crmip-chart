# CRMIP Chart

A small library to render an **Injector → Producer** connectivity graph (CRMIP style) using **D3**.

## Concept

- **Node**: `Injector` or `Producer`
  - Injector: `rate` = injected water rate (m³)
  - Producer: `rate` = liquid rate (m³), optional `oil` (m³), `wc` (%)
- **Link**: connection from Injector → Producer with `gain`


## Install

```bash
npm i crmip-connectivity-chart
```

This package is **browser-first** and expects **D3 v7** available.

## Usage (bundler)

```js
import CRMIPChart from 'crmip-connectivity-chart';

const I429 = new CRMIPChart.Injector('I429', 200.7);
const I430 = new CRMIPChart.Injector('I430', 155.2);

const P6001 = new CRMIPChart.Producer('P6001', 56.6, { oil: 12.5, wc: 78.0 });
const P9002BB = new CRMIPChart.Producer('P9002BB', 78.5, { oil: 19.7, wc: 74.9 });

const links = [
  new CRMIPChart.Link(I429, P6001, 0.03),
  new CRMIPChart.Link(I429, P9002BB, 0.005),
  new CRMIPChart.Link(I430, P9002BB, 0.012) // 1 producer affected by 2 injectors
];

CRMIPChart.render('#chart', {
  nodes: [I429, I430, P6001, P9002BB],
  links
}, {
  layout: { mode: 'force', width: 1200, height: 900 },
  gainEps: 1e-12,
  format: { pctMinDisplay: 0.1, pctDecimals: 1, volDecimals: 1 },
  enableDrag: true
});
```

## Usage (plain HTML)

```html
<div id="chart" style="height: 90vh"></div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="./node_modules/crmip-connectivity-chart/dist/crmip_chart.umd.js"></script>
<script>
  const I429 = new CRMIPChart.Injector('I429', 200.7);
  const P6001 = new CRMIPChart.Producer('P6001', 56.6);
  const links = [ new CRMIPChart.Link(I429, P6001, 0.03) ];

  CRMIPChart.render('#chart', { nodes: [I429, P6001], links });
</script>
```

## API

- `CRMIPChart.render(container, data, options)`
- Classes:
  - `new CRMIPChart.Injector(id, rate, extra?)`
  - `new CRMIPChart.Producer(id, rate, extra?)`
  - `new CRMIPChart.Link(injector, producer, gain)` (accepts ids or node instances)

Notes:

- Links can also use `{ injectorId, producerId, gain }` or `{ source, target, gain }`.
- This library relies on your page CSS variables (e.g. `--link-color`) for theming.
