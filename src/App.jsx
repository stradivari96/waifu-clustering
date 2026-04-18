import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
} from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import * as d3 from 'd3'
import waifusData from './waifus.json'

const MAX_LINKS_PER_NODE = 3
const NODE_R = 30

const waifuMap = new Map(waifusData.map((w) => [w.id, w]))

const imageCache = new Map()
function getImage(src) {
  if (!imageCache.has(src)) {
    const img = new Image()
    img.src = src
    imageCache.set(src, img)
  }
  return imageCache.get(src)
}

function buildGraph(allLinks, maxRank) {
  const validIds = new Set(
    waifusData.filter((w) => w.like_rank <= maxRank).map((w) => w.id)
  )

  const filtered = allLinks.filter(
    (l) => validIds.has(l.source) && validIds.has(l.target)
  )

  // Build adjacency for efficient per-node top-K selection
  const adjacency = new Map()
  filtered.forEach((link, i) => {
    if (!adjacency.has(link.source)) adjacency.set(link.source, [])
    if (!adjacency.has(link.target)) adjacency.set(link.target, [])
    adjacency.get(link.source).push(i)
    adjacency.get(link.target).push(i)
  })

  const visibleIndices = new Set()
  for (const id of validIds) {
    const neighbors = adjacency.get(id) || []
    neighbors
      .sort((a, b) => filtered[a].value - filtered[b].value)
      .slice(0, MAX_LINKS_PER_NODE)
      .forEach((i) => visibleIndices.add(i))
  }

  const links = [...visibleIndices].map((i) => ({
    ...filtered[i],
    value: filtered[i].value - 0.2,
  }))

  const nodes = waifusData
    .filter((w) => validIds.has(w.id))
    .map((w) => ({
      id: w.id,
      name: w.name,
      img: getImage(w.display_picture),
      rank: w.like_rank,
      likes: w.likes,
      trash: w.trash,
      url: w.url,
      display_picture: w.display_picture,
      series: w.appearances?.[0]?.name ?? 'Unknown',
    }))

  return { nodes, links }
}

export default function App() {
  const fgRef = useRef()
  const [allLinks, setAllLinks] = useState(null)
  const [loadProgress, setLoadProgress] = useState(0)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [maxRank, setMaxRank] = useState(300)
  const [search, setSearch] = useState('')
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  const deferredMaxRank = useDeferredValue(maxRank)

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Load the large links file once
  useEffect(() => {
    async function load() {
      const res = await fetch(`${import.meta.env.BASE_URL}waifu_links.json`)
      const contentLength = +res.headers.get('Content-Length')
      const reader = res.body.getReader()
      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (contentLength) setLoadProgress(Math.round((received / contentLength) * 100))
      }

      const buf = new Uint8Array(received)
      let pos = 0
      for (const c of chunks) { buf.set(c, pos); pos += c.length }
      setAllLinks(JSON.parse(new TextDecoder().decode(buf)))
    }
    load()
  }, [])

  const graphData = useMemo(() => {
    if (!allLinks) return null
    return buildGraph(allLinks, deferredMaxRank)
  }, [allLinks, deferredMaxRank])

  // Apply d3 forces after graph data changes
  useEffect(() => {
    if (!fgRef.current || !graphData) return
    fgRef.current.d3Force('collide', d3.forceCollide().radius(NODE_R + 6))
    fgRef.current.d3Force('link')?.distance((l) => 3500 * Math.abs(l.value))
  }, [graphData])

  // Zoom to fit on first load
  useEffect(() => {
    if (!graphData || !fgRef.current) return
    const t = setTimeout(() => fgRef.current?.zoomToFit(800, 80), 1200)
    return () => clearTimeout(t)
  }, [graphData])

  const searchTerm = search.toLowerCase().trim()
  const highlightedIds = useMemo(() => {
    if (!searchTerm || !graphData) return new Set()
    return new Set(
      graphData.nodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchTerm) ||
            n.series.toLowerCase().includes(searchTerm)
        )
        .map((n) => n.id)
    )
  }, [searchTerm, graphData])

  const nodeCanvasObject = useCallback(
    (node, ctx) => {
      const { x, y } = node
      const isHovered = hoveredNode?.id === node.id
      const isSelected = selectedNode?.id === node.id
      const isHighlighted = isHovered || isSelected || highlightedIds.has(node.id)
      const dimmed = searchTerm.length > 0 && !isHighlighted

      ctx.save()
      ctx.globalAlpha = dimmed ? 0.15 : 1

      // Glow
      if (isSelected) {
        ctx.shadowBlur = 24
        ctx.shadowColor = '#ff69b4'
      } else if (isHovered) {
        ctx.shadowBlur = 16
        ctx.shadowColor = '#ffb3d9'
      } else if (highlightedIds.has(node.id)) {
        ctx.shadowBlur = 10
        ctx.shadowColor = '#ff9dce'
      }

      // Circular clip for image
      ctx.beginPath()
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2)
      ctx.clip()

      if (node.img.complete && node.img.naturalWidth > 0) {
        ctx.drawImage(node.img, x - NODE_R, y - NODE_R, NODE_R * 2, NODE_R * 2)
      } else {
        ctx.fillStyle = '#2a1a2e'
        ctx.fill()
      }

      ctx.restore()
      ctx.save()
      ctx.globalAlpha = dimmed ? 0.15 : 1

      // Border ring
      ctx.beginPath()
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected
        ? '#ff69b4'
        : isHovered
        ? '#ffb3d9'
        : highlightedIds.has(node.id)
        ? '#ff9dce'
        : 'rgba(255,105,180,0.3)'
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1
      ctx.stroke()

      // Label below node on hover / selected
      if (isHovered || isSelected) {
        const label = node.name
        const fs = 10
        ctx.font = `bold ${fs}px sans-serif`
        const tw = ctx.measureText(label).width
        const bx = x - tw / 2 - 5
        const by = y + NODE_R + 4

        ctx.fillStyle = 'rgba(13,13,26,0.88)'
        ctx.fillRect(bx, by, tw + 10, fs + 8)

        ctx.fillStyle = '#ffb3d9'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, x, by + 4)
      }

      ctx.restore()
    },
    [hoveredNode, selectedNode, highlightedIds, searchTerm]
  )

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, NODE_R, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  const linkColor = useCallback((link) => {
    const s = Math.max(0, Math.min(1, 1 - link.value))
    return `rgba(255,105,180,${0.08 + s * 0.45})`
  }, [])

  const linkWidth = useCallback((link) => 0.5 + (1 - link.value) * 1.5, [])

  const handleNodeClick = useCallback(
    (node) =>
      setSelectedNode((prev) => (prev?.id === node.id ? null : node)),
    []
  )

  if (!allLinks) {
    return (
      <div className="loading">
        <div className="loading-content">
          <div className="spinner" />
          <p>Loading waifu connections…</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <span className="progress-label">{loadProgress}%</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon">✿</span>
          <span>Waifu Clusters</span>
        </div>
        <div className="controls">
          <label className="rank-control">
            <span>Top {maxRank}</span>
            <input
              type="range"
              min={50}
              max={1000}
              step={50}
              value={maxRank}
              onChange={(e) => setMaxRank(+e.target.value)}
            />
          </label>
          <input
            className="search-input"
            type="search"
            placeholder="Search waifu or series…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn-reset"
            onClick={() => fgRef.current?.zoomToFit(600, 80)}
          >
            Fit
          </button>
        </div>
      </div>

      <div className="status-bar">
        <span>{graphData?.nodes.length ?? 0} waifus</span>
        <span>{graphData?.links.length ?? 0} connections</span>
        {maxRank !== deferredMaxRank && <span className="computing">computing…</span>}
      </div>

      {graphData && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeRelSize={NODE_R}
          d3AlphaDecay={0}
          cooldownTime={Infinity}
          backgroundColor="#0d0d1a"
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onNodeHover={setHoveredNode}
          onNodeClick={handleNodeClick}
        />
      )}

      {selectedNode && (
        <aside className="panel">
          <button
            className="panel-close"
            onClick={() => setSelectedNode(null)}
            aria-label="Close"
          >
            ✕
          </button>
          <img
            className="panel-avatar"
            src={selectedNode.display_picture}
            alt={selectedNode.name}
          />
          <h2 className="panel-name">{selectedNode.name}</h2>
          <p className="panel-series">{selectedNode.series}</p>
          <div className="panel-stats">
            <div className="stat">
              <span className="stat-label">Rank</span>
              <span className="stat-value">#{selectedNode.rank}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Likes</span>
              <span className="stat-value pink">
                {selectedNode.likes?.toLocaleString()}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Trash</span>
              <span className="stat-value muted">
                {selectedNode.trash?.toLocaleString()}
              </span>
            </div>
          </div>
          {selectedNode.url && (
            <a
              className="panel-link"
              href={selectedNode.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on MyWaifuList ↗
            </a>
          )}
        </aside>
      )}
    </div>
  )
}
