import React, { useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3";

import waifus from "./waifus.json";
import waifu_links from "./waifu_links.json";

const maxRank = 300;
const maxLinks = 3;
const size = 100;

const validIds = new Set(
  waifus.filter(({ like_rank }) => like_rank <= maxRank).map((w) => w.id)
);

const links = waifu_links.filter(
  ({ source, target }) => validIds.has(source) && validIds.has(target)
);

for (let id of validIds) {
  const waifuLinks = links.filter(
    ({ source, target }) => source === id || target === id
  );

  waifuLinks
    .sort((a, b) => a.value - b.value)
    .slice(0, maxLinks)
    .forEach((link) => {
      link.visible = true;
      link.value -= 0.2;
    });
}

const data = {
  nodes: Object.values(waifus)
    .filter((w) => validIds.has(w.id))
    .map((node) => {
      const img = new Image();
      img.src = node.display_picture;

      return {
        id: node.id,
        text: node.name,
        img,
      };
    }),
  links,
};

function App() {
  const fgRef = useRef();

  useEffect(() => {
    fgRef.current.d3Force("collide", d3.forceCollide().radius(size / 2));
    fgRef.current.d3Force("link").distance((link) => 4_000 * link.value);
  }, []);

  return (
    <div className="App">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeRelSize={size}
        d3AlphaDecay={0}
        cooldownTime="infinity"
        nodeCanvasObject={({ img, x, y }, ctx) => {
          ctx.fillStyle = "#FFFFFF";
          x = x - size / 2;
          y = y - size / 2;
          ctx.fillRect(x, y, size, size);
          ctx.drawImage(img, x, y, size, size);
        }}
        linkVisibility={(link) => link.visible}
      />
    </div>
  );
}

export default App;
