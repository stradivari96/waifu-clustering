import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import Fuse from 'fuse.js'
import waifusData from './waifus.json'

const TOP_SERIES = 12
const PALETTE = [
  '#ff6b9d', '#4ecdc4', '#ffe066', '#a78bfa',
  '#fb923c', '#34d399', '#f472b6', '#60a5fa',
  '#fbbf24', '#a3e635', '#e879f9', '#2dd4bf',
]

const imgCache = new Map()
function loadImg(src) {
  if (!imgCache.has(src)) {
    const img = new Image()
    img.src = src
    imgCache.set(src, img)
  }
  return imgCache.get(src)
}

export default function App() {
  const canvasRef = useRef()
  const zoomRef = useRef()
  const transformRef = useRef(d3.zoomIdentity)
  const nodesRef = useRef([])
  const drawRef = useRef(null)
  const sizeRef = useRef({ w: window.innerWidth, h: window.innerHeight })

  const [ready, setReady] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [activeSeries, setActiveSeries] = useState(null)
  const [size, setSize] = useState(sizeRef.current)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [hoverSource, setHoverSource] = useState(null)

  useEffect(() => {
    const onResize = () => {
      const s = { w: window.innerWidth, h: window.innerHeight }
      sizeRef.current = s
      setSize(s)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Series color mapping
  const { colorMap, legendItems } = useMemo(() => {
    const counts = new Map()
    waifusData.forEach(w => {
      const s = w.appearances?.[0]?.name ?? 'Unknown'
      counts.set(s, (counts.get(s) || 0) + 1)
    })
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const colorMap = new Map()
    sorted.slice(0, TOP_SERIES).forEach(([s], i) => colorMap.set(s, PALETTE[i]))
    const legendItems = sorted.slice(0, TOP_SERIES).map(([name, count]) => ({
      name, count, color: colorMap.get(name),
    }))
    return { colorMap, legendItems }
  }, [])

  const neighborsRef = useRef({})
  const similarRef = useRef({})
  const antiRef = useRef({})
  const nodeByIdRef = useRef({})

  // Load layout + build nodes
  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}waifu_layout.json`).then(r => { if (!r.ok) throw new Error('missing'); return r.json() }),
      fetch(`${import.meta.env.BASE_URL}waifu_neighbors.json`).then(r => r.ok ? r.json() : {}),
      fetch(`${import.meta.env.BASE_URL}waifu_similar.json`).then(r => r.ok ? r.json() : {}),
      fetch(`${import.meta.env.BASE_URL}waifu_antiwaifus.json`).then(r => r.ok ? r.json() : {}),
    ]).then(([layout, neighbors, similar, anti]) => {
      neighborsRef.current = neighbors
      similarRef.current = similar
      antiRef.current = anti
      const nodes = waifusData.flatMap(w => {
        const pos = layout[String(w.id)]
        if (!pos) return []
        const series = w.appearances?.[0]?.name ?? 'Unknown'
        const img = loadImg(w.display_picture)
        const node = {
          id: w.id,
          name: w.name,
          wx: pos[0], wy: pos[1],
          r: Math.max(14, Math.min(35, Math.sqrt(w.likes || 1) * 0.85)),
          likes: w.likes || 0,
          trash: w.trash || 0,
          like_rank: w.like_rank,
          url: w.url,
          display_picture: w.display_picture,
          series,
          color: colorMap.get(series) ?? '#4a4a6a',
          img,
        }
        if (!img.complete) img.onload = () => drawRef.current?.()
        return [node]
      })
      nodesRef.current = nodes
      nodeByIdRef.current = Object.fromEntries(nodes.map(n => [String(n.id), n]))
      setReady(true)
    }).catch(() => setLayoutError(true))
  }, [colorMap])

  // Resize canvas with DPR
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    drawRef.current?.()
  }, [size])

  const fuseRef = useRef(null)
  useEffect(() => {
    if (!ready) return
    fuseRef.current = new Fuse(nodesRef.current, {
      keys: ['name', 'series'],
      threshold: 0.4,
      includeScore: true,
    })
  }, [ready])

  const suggestions = useMemo(() => {
    const term = search.trim()
    if (!term || !fuseRef.current) return []
    return fuseRef.current.search(term, { limit: 8 }).map(r => r.item)
  }, [search, ready])

  const selectSuggestion = useCallback((node) => {
    setSelected(node)
    setSearch('')
    const canvas = canvasRef.current
    const zoom = zoomRef.current
    const { w, h } = sizeRef.current
    if (!canvas || !zoom) return
    const k = Math.max(transformRef.current.k, 3)
    const tx = w / 2 - k * node.wx
    const ty = h / 2 - k * node.wy
    d3.select(canvas).transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
  }, [])

  // Fit all nodes into view
  const fitView = useCallback((animated = true) => {
    const canvas = canvasRef.current
    const zoom = zoomRef.current
    const nodes = nodesRef.current
    const { w, h } = sizeRef.current
    if (!canvas || !zoom || !nodes.length) return
    const xs = nodes.map(n => n.wx)
    const ys = nodes.map(n => n.wy)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const y0 = Math.min(...ys), y1 = Math.max(...ys)
    const pad = 80
    const k = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0))
    const tx = w / 2 - k * (x0 + x1) / 2
    const ty = h / 2 - k * (y0 + y1) / 2
    const t = d3.zoomIdentity.translate(tx, ty).scale(k)
    const sel = d3.select(canvas)
    if (animated) sel.transition().duration(700).call(zoom.transform, t)
    else sel.call(zoom.transform, t)
  }, [])

  // Set up D3 zoom once when ready
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    const zoom = d3.zoom()
      .scaleExtent([0.03, 20])
      .on('zoom', e => {
        transformRef.current = e.transform
        drawRef.current?.()
      })
    zoomRef.current = zoom
    d3.select(canvas).call(zoom)
    fitView(false)
  }, [ready, fitView])

  // Draw — defined as a plain function so it always closes over latest state.
  // Stored in drawRef so the zoom handler always calls the freshest version.
  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const t = transformRef.current
    const nodes = nodesRef.current
    const term = search.toLowerCase().trim()
    const hasFilter = term.length > 0 || !!activeSeries

    // Background
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // World transform: 1 world unit = t.k CSS pixels
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y)

    const showPortrait = t.k > 0.35   // portraits when nodes ≥ ~5px radius
    const showLabel = t.k > 1.4        // labels when nodes ≥ ~20px radius

    // ---- Link overlay for hovered / selected node ----
    const activeNode = selected ?? hovered
    if (activeNode) {
      const nodeById = nodeByIdRef.current
      const drawEdges = (pairs, r, g, b) => {
        for (const [nid, strength] of (pairs || [])) {
          const target = nodeById[nid]
          if (!target) continue
          ctx.beginPath()
          ctx.moveTo(activeNode.wx, activeNode.wy)
          ctx.lineTo(target.wx, target.wy)
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.15 + strength * 0.65})`
          ctx.lineWidth = (0.8 + strength * 2) / t.k
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(target.wx, target.wy, (2 + strength * 3) / t.k, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + strength * 0.5})`
          ctx.fill()
        }
      }
      drawEdges(neighborsRef.current[String(activeNode.id)], 78, 205, 196)    // teal
      drawEdges(antiRef.current[String(activeNode.id)], 244, 63, 94)         // red
    }

    for (const node of nodes) {
      const { wx: x, wy: y, r, img } = node
      const isHov = hovered?.id === node.id
      const isSel = selected?.id === node.id
      const nameHit = term && (
        node.name.toLowerCase().includes(term) ||
        node.series.toLowerCase().includes(term)
      )
      const seriesHit = !activeSeries || node.series === activeSeries
      const lit = isHov || isSel || nameHit
      const dim = hasFilter && !lit && !seriesHit

      ctx.save()
      ctx.globalAlpha = dim ? 0.07 : 1

      // Glow for hovered/selected
      if (isSel || isHov) {
        ctx.shadowColor = '#ff69b4'
        ctx.shadowBlur = 10 * dpr
      }

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)

      if (showPortrait && img.complete && img.naturalWidth) {
        // Clip to circle, draw portrait
        ctx.save()
        ctx.clip()
        ctx.shadowBlur = 0
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
        ctx.restore()
      } else {
        // Solid dot at low zoom
        ctx.fillStyle = node.color
        ctx.fill()
      }

      // Ring
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.strokeStyle = isSel || lit ? '#ff69b4' : node.color
      ctx.lineWidth = (isSel ? 3.5 : lit ? 2.5 : 1.5) / t.k
      ctx.stroke()

      // Label
      if (isHov || isSel || (showLabel && !dim)) {
        const fs = 11 / t.k
        ctx.font = `bold ${fs}px sans-serif`
        ctx.textAlign = 'center'
        ctx.shadowBlur = 0
        const tw = ctx.measureText(node.name).width
        const pad = 3 / t.k
        const lx = x - tw / 2 - pad
        const ly = y + r + 2 / t.k
        ctx.fillStyle = 'rgba(13,13,26,0.85)'
        ctx.fillRect(lx, ly, tw + pad * 2, fs + pad * 2)
        ctx.fillStyle = isHov || isSel ? '#ff69b4' : '#e0c8e0'
        ctx.textBaseline = 'top'
        ctx.fillText(node.name, x, ly + pad)
      }

      ctx.restore()
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  drawRef.current = draw

  // Redraw when React state changes
  useEffect(() => { drawRef.current?.() }, [hovered, selected, search, activeSeries, size, ready])

  // Hover detection
  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const t = transformRef.current
    const wx = (e.clientX - rect.left - t.x) / t.k
    const wy = (e.clientY - rect.top - t.y) / t.k
    setCursor({ x: e.clientX, y: e.clientY })
    let found = null, minD = Infinity
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.wx - wx, n.wy - wy)
      if (d <= n.r && d < minD) { minD = d; found = n }
    }
    if (found) setHoverSource('canvas')
    setHovered(prev => prev?.id === found?.id ? prev : found)
  }, [])

  const handleClick = useCallback(() => {
    setSelected(prev => hovered
      ? prev?.id === hovered.id ? null : hovered
      : prev
    )
  }, [hovered])

  const handleSidebarHover = useCallback((node, e) => {
    setHoverSource('sidebar')
    setHovered(node)
    setCursor({ x: e.clientX, y: e.clientY })
  }, [])

  const trashRate = selected
    ? Math.round(100 * selected.trash / Math.max(1, selected.likes + selected.trash))
    : 0

  const similarNodes = selected
    ? (similarRef.current[String(selected.id)] || [])
        .map(([nid]) => nodeByIdRef.current[nid]).filter(Boolean)
    : []

  const antiNodes = selected
    ? (antiRef.current[String(selected.id)] || [])
        .map(([nid]) => nodeByIdRef.current[nid]).filter(Boolean)
    : []

  if (layoutError) {
    return (
      <div className="loading">
        <div className="loading-content">
          <p style={{ color: '#ff6b9d', fontWeight: 700 }}>Layout not found.</p>
          <p>Run: <code style={{ background: 'rgba(255,105,180,0.1)', padding: '2px 6px', borderRadius: 4 }}>python data/compute_tsne.py</code></p>
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
          <div className="search-wrapper">
            <input
              className="search-input"
              type="search"
              placeholder="Search waifu or series…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map(node => (
                  <div key={node.id} className="suggestion-item" onMouseDown={() => selectSuggestion(node)}>
                    <img className="suggestion-img" src={node.display_picture} alt="" />
                    <div className="suggestion-text">
                      <span className="suggestion-name">{node.name}</span>
                      <span className="suggestion-series">{node.series}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn-reset" onClick={() => fitView(true)}>Fit</button>
        </div>
        <span className="status-count">{nodesRef.current.length} waifus · scroll to zoom</span>
      </div>

      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: hovered ? 'pointer' : 'grab' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); setHoverSource(null); }}
        onClick={handleClick}
      />

      {/* Canvas Tooltip (Floating) */}
      {hovered && hoverSource === 'canvas' && (
        <div className="canvas-tooltip" style={{ left: cursor.x + 16, top: cursor.y - 12 }}>
          <div className="tooltip-name">{hovered.name}</div>
          <div className="tooltip-series">{hovered.series}</div>
        </div>
      )}

      {/* Sidebar Preview Card (Fixed on Left) */}
      {hovered && hoverSource === 'sidebar' && (
        <div className="preview-card">
          <img className="preview-card-img" src={hovered.display_picture} alt="" />
          <div className="preview-card-body">
            <div className="preview-card-name">{hovered.name}</div>
            <div className="preview-card-series">{hovered.series}</div>
            <div className="preview-card-stats">
              <span className="pink">♥ {hovered.likes.toLocaleString()}</span>
              <span className="muted">🗑 {hovered.trash.toLocaleString()}</span>
              <span className="muted">#{hovered.like_rank}</span>
            </div>
          </div>
        </div>
      )}

      {/* Series legend */}
      <div className="legend">
        <div className="legend-title">Top Series</div>
        {legendItems.map(({ name, count, color }) => (
          <button
            key={name}
            className={`legend-item${activeSeries === name ? ' active' : ''}`}
            onClick={() => setActiveSeries(s => s === name ? null : name)}
          >
            <span className="legend-dot" style={{ background: color }} />
            <span className="legend-name">{name}</span>
            <span className="legend-count">{count}</span>
          </button>
        ))}
        {activeSeries && (
          <button className="legend-clear" onClick={() => setActiveSeries(null)}>
            clear filter
          </button>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <aside className="panel">
          <button className="panel-close" onClick={() => setSelected(null)}>✕</button>
          <img className="panel-avatar" src={selected.display_picture} alt={selected.name} />
          <h2 className="panel-name">{selected.name}</h2>
          <p className="panel-series">{selected.series}</p>
          <div className="panel-stats">
            <div className="stat">
              <span className="stat-label">Rank</span>
              <span className="stat-value">#{selected.like_rank}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Likes</span>
              <span className="stat-value pink">♥ {selected.likes.toLocaleString()}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Trash</span>
              <span className="stat-value muted">{selected.trash.toLocaleString()}</span>
            </div>
          </div>
          <div className="controversy">
            <div className="controversy-row">
              <span>Controversy</span>
              <span>{trashRate}%</span>
            </div>
            <div className="controversy-track">
              <div className="controversy-fill" style={{ width: `${trashRate}%` }} />
            </div>
          </div>
          {similarNodes.length > 0 && (
            <div className="waifu-section">
              <div className="waifu-section-label">Similar</div>
              <div className="waifu-list">
                {similarNodes.map(n => (
                  <button 
                    key={n.id} 
                    className="waifu-row-item" 
                    onClick={() => setSelected(n)}
                    onMouseEnter={(e) => handleSidebarHover(n, e)}
                    onMouseMove={(e) => handleSidebarHover(n, e)}
                    onMouseLeave={() => { setHovered(null); setHoverSource(null); }}
                  >
                    <img src={n.display_picture} alt={n.name} />
                    <div className="waifu-row-info">
                      <span className="waifu-row-name">{n.name}</span>
                      {n.series === selected.series && (
                        <span className="waifu-chip">Same Show</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {antiNodes.length > 0 && (
            <div className="waifu-section">
              <div className="waifu-section-label anti">Anti</div>
              <div className="waifu-list">
                {antiNodes.map(n => (
                  <button 
                    key={n.id} 
                    className="waifu-row-item anti" 
                    onClick={() => setSelected(n)}
                    onMouseEnter={(e) => handleSidebarHover(n, e)}
                    onMouseMove={(e) => handleSidebarHover(n, e)}
                    onMouseLeave={() => { setHovered(null); setHoverSource(null); }}
                  >
                    <img src={n.display_picture} alt={n.name} />
                    <span className="waifu-row-name">{n.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {selected.url && (
            <a className="panel-link" href={selected.url} target="_blank" rel="noopener noreferrer">
              View on MyWaifuList ↗
            </a>
          )}
        </aside>
      )}

      {!ready && (
        <div className="loading">
          <div className="loading-content">
            <div className="spinner" />
            <p>Loading waifu universe…</p>
          </div>
        </div>
      )}
    </div>
  )
}
