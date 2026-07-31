// D3 timeline: a sticky-top axis SVG + a tall bars SVG inside a single
// scroll container. setZoom() changes the SVG width (overflowing the
// container horizontally) so labels never get squeezed.

const ERA_COLORS = {
  Medieval: "#9B8FE8",
  Renaissance: "#2EC090",
  Baroque: "#E8A020",
  Classical: "#E86040",
  Romantic: "#E0608A",
  Modern: "#50A0E8",
  Contemporary: "#70C030",
};

const WORLD_EVENTS = [
  { year: 1789, label: "French Revolution" },
  { year: 1815, label: "Napoleonic Wars end" },
  { year: 1848, label: "1848 Revolutions" },
  { year: 1914, label: "WWI begins", spanEnd: 1918 },
  { year: 1939, label: "WWII begins", spanEnd: 1945 },
];

const ROW_H = 28;
const ROW_GAP = 6;
const ROW_STRIDE = ROW_H + ROW_GAP;
const MARGIN = { top: 8, right: 32, bottom: 12, left: 32 };
const AXIS_H = 56;
const X_DOMAIN = [1000, 2026];

export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6];

export function eraColor(era) {
  return ERA_COLORS[era] || "#888";
}

export function createTimeline(rootEl, composers, opts = {}) {
  const allData = [...composers].sort((a, b) => a.born - b.born);
  let data = allData; // current filtered view
  let filterEra = null;
  const currentYear = new Date().getFullYear();
  const lookup = new Map(allData.map(c => [c.id, c])); // always full — panel connections may reach across eras

  // Build SVGs inside rootEl
  rootEl.innerHTML = "";
  const axisSvgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  axisSvgEl.setAttribute("class", "axis-svg");
  rootEl.appendChild(axisSvgEl);

  const barsSvgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  barsSvgEl.setAttribute("class", "bars-svg");
  rootEl.appendChild(barsSvgEl);

  const axisSvg = d3.select(axisSvgEl);
  const barsSvg = d3.select(barsSvgEl);
  const linesLayer = barsSvg.append("g").attr("class", "lines-layer");
  const barsLayer = barsSvg.append("g").attr("class", "bars-layer");

  let selectedId = null;
  let zoom = 1;
  const onSelectCb = opts.onSelect || (() => {});
  const onHoverCb = opts.onHover || (() => {});
  const onHoverEndCb = opts.onHoverEnd || (() => {});
  const onZoomChange = opts.onZoomChange || (() => {});

  let svgWidth = 0;
  let xScale = d3.scaleLinear().domain(X_DOMAIN);
  function totalBarsHeight() {
    return data.length * ROW_STRIDE + MARGIN.top + MARGIN.bottom + 2;
  }

  function computeWidth() {
    const viewport = Math.max(320, rootEl.clientWidth);
    svgWidth = Math.round(viewport * zoom);
    xScale.range([MARGIN.left, svgWidth - MARGIN.right]);
  }

  function drawAxis() {
    axisSvg.selectAll("*").remove();
    axisSvg
      .attr("width", svgWidth)
      .attr("height", AXIS_H)
      .attr("viewBox", `0 0 ${svgWidth} ${AXIS_H}`);

    const axisY = AXIS_H - 18;
    const tickEvery = zoom >= 3 ? 25 : zoom >= 2 ? 50 : 100;
    const tickValues = d3.range(Math.ceil(X_DOMAIN[0] / tickEvery) * tickEvery, X_DOMAIN[1] + 1, tickEvery);

    const ax = d3.axisBottom(xScale)
      .tickValues(tickValues)
      .tickFormat(d => d)
      .tickSize(6);

    axisSvg.append("g")
      .attr("transform", `translate(0,${axisY})`)
      .call(ax)
      .call(g => g.select(".domain").attr("stroke", "#444"))
      .call(g => g.selectAll(".tick line").attr("stroke", "#444"))
      .call(g => g.selectAll(".tick text").attr("fill", "#9a9690").attr("font-size", 11));

    // World event markers
    const ev = axisSvg.selectAll(".event-marker")
      .data(WORLD_EVENTS)
      .join("g")
      .attr("class", "event-marker");

    ev.append("rect")
      .attr("x", d => xScale(d.year))
      .attr("y", 6)
      .attr("width", d => d.spanEnd ? Math.max(2, xScale(d.spanEnd) - xScale(d.year)) : 2)
      .attr("height", axisY - 6)
      .attr("fill", d => d.spanEnd ? "rgba(255,255,255,0.06)" : "transparent");

    ev.append("line")
      .attr("x1", d => xScale(d.year))
      .attr("x2", d => xScale(d.year))
      .attr("y1", 6)
      .attr("y2", axisY);

    ev.append("text")
      .attr("x", d => xScale(d.year) + 4)
      .attr("y", 14)
      .text(d => d.label);
  }

  function drawBars() {
    barsSvg
      .attr("width", svgWidth)
      .attr("height", totalBarsHeight())
      .attr("viewBox", `0 0 ${svgWidth} ${totalBarsHeight()}`);

    barsLayer.selectAll(".bar-group").remove();

    const g = barsLayer.selectAll(".bar-group")
      .data(data, d => d.id)
      .join("g")
      .attr("class", "bar-group")
      .attr("transform", (d, i) => `translate(0, ${MARGIN.top + i * ROW_STRIDE})`)
      .on("click", (event, d) => onSelectCb(d.id))
      .on("mousemove", (event, d) => onHoverCb(d, event))
      .on("mouseleave", (event, d) => onHoverEndCb(d, event));

    g.each(function(d) {
      const grp = d3.select(this);
      const x0 = xScale(d.born);
      const x1 = xScale(d.died ?? currentYear);
      const w = Math.max(2, x1 - x0);
      const color = eraColor(d.era);

      grp.append("rect")
        .attr("class", "bar")
        .attr("x", x0)
        .attr("y", 0)
        .attr("width", w)
        .attr("height", ROW_H)
        .attr("rx", 3)
        .attr("fill", color)
        .attr("opacity", 0.85);

      // Name label — clipped to bar width
      const labelPad = 8;
      const labelWidth = Math.max(0, w - labelPad * 2);
      const clipId = `clip-${d.id}`;
      grp.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", x0 + labelPad)
        .attr("y", 0)
        .attr("width", labelWidth)
        .attr("height", ROW_H);

      grp.append("text")
        .attr("class", "bar-label")
        .attr("x", x0 + labelPad)
        .attr("y", ROW_H / 2 + 4)
        .attr("clip-path", `url(#${clipId})`)
        .text(d.name);

      grp.append("text")
        .attr("class", "bar-years")
        .attr("x", x0 - 4)
        .attr("y", ROW_H / 2 + 4)
        .attr("text-anchor", "end")
        .text(d.born);

      grp.append("text")
        .attr("class", "bar-years")
        .attr("x", x1 + 4)
        .attr("y", ROW_H / 2 + 4)
        .attr("text-anchor", "start")
        .text(d.died ?? "—");
    });
  }

  function drawRelationships() {
    linesLayer.selectAll(".relationship-line").remove();
    if (!selectedId) return;
    const sel = lookup.get(selectedId);
    if (!sel || !sel.relationships || sel.relationships.length === 0) return;

    const selIdx = data.findIndex(c => c.id === selectedId);
    if (selIdx < 0) return;
    const selY = MARGIN.top + selIdx * ROW_STRIDE + ROW_H / 2;
    const selXMid = (xScale(sel.born) + xScale(sel.died ?? currentYear)) / 2;

    sel.relationships.forEach(rel => {
      const rid = typeof rel === "string" ? rel : rel.id;
      const other = lookup.get(rid);
      if (!other) return;
      const oIdx = data.findIndex(c => c.id === rid);
      if (oIdx < 0) return;
      const oY = MARGIN.top + oIdx * ROW_STRIDE + ROW_H / 2;
      const oXMid = (xScale(other.born) + xScale(other.died ?? currentYear)) / 2;

      const x1 = selXMid, y1 = selY;
      const x2 = oXMid, y2 = oY;
      const dx = (x2 - x1) * 0.3;
      const path = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

      linesLayer.append("path")
        .attr("class", "relationship-line")
        .attr("d", path);
    });
  }

  function applySelection() {
    barsLayer.selectAll(".bar-group")
      .classed("selected", d => d.id === selectedId)
      .classed("dim", d => {
        if (!selectedId) return false;
        if (d.id === selectedId) return false;
        const sel = lookup.get(selectedId);
        const related = new Set((sel?.relationships || []).map(r => typeof r === "string" ? r : r.id));
        return !related.has(d.id);
      });
  }

  function rebuild() {
    computeWidth();
    drawAxis();
    drawBars();
    drawRelationships();
    applySelection();
    onZoomChange(zoom);
  }

  rebuild();

  window.addEventListener("resize", () => rebuild());

  // Recompute SVG width whenever the scroll container resizes — including
  // during the panel push-aside animation, when clientWidth changes smoothly.
  if (typeof ResizeObserver !== "undefined") {
    let rafId = null;
    const ro = new ResizeObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        rebuild();
      });
    });
    ro.observe(rootEl);
  }

  return {
    select(id) {
      selectedId = id;
      applySelection();
      drawRelationships();
    },
    clear() {
      selectedId = null;
      applySelection();
      drawRelationships();
    },
    setFilter(era) {
      const next = era || null;
      if (next === filterEra) return;
      filterEra = next;
      data = filterEra ? allData.filter(c => c.era === filterEra) : allData;
      rebuild();
    },
    getFilter: () => filterEra,
    getFilteredData: () => data,
    getAllData: () => allData,
    setZoom(z) {
      const clamped = Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], z));
      if (clamped === zoom) return;
      const scroller = rootEl;
      // Preserve scroll center across zoom
      const beforeCenter = (scroller.scrollLeft + scroller.clientWidth / 2) / Math.max(1, svgWidth);
      zoom = clamped;
      rebuild();
      const newCenter = beforeCenter * svgWidth;
      scroller.scrollLeft = Math.max(0, newCenter - scroller.clientWidth / 2);
    },
    getZoom: () => zoom,
    scrollToComposer(id) {
      const idx = data.findIndex(c => c.id === id);
      if (idx < 0) return;
      const targetY = MARGIN.top + idx * ROW_STRIDE + AXIS_H;
      const c = lookup.get(id);
      const targetX = (xScale(c.born) + xScale(c.died ?? currentYear)) / 2;
      rootEl.scrollTo({
        left: Math.max(0, targetX - rootEl.clientWidth / 2),
        top: Math.max(0, targetY - rootEl.clientHeight / 2),
        behavior: "smooth",
      });
    },
    rebuild,
    eraColor,
  };
}
