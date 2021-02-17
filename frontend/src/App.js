import React, { useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3";

import waifus from "./waifus.json";
import waifu_links from "./waifu_links.json";

function App() {
  const fgRef = useRef();
  const data = {
    nodes: Object.values(waifus).map((node) => {
      const img = new Image();
      img.src = node.display_picture;

      return {
        id: node.id,
        text: node.name,
        img,
      };
    }),
    links: waifu_links,
  };
  useEffect(() => {
    fgRef.current.d3Force("collide", d3.forceCollide().radius(10));
    fgRef.current.d3Force("link").distance((link) => 300_000 * link.value);
  }, []);

  return (
    <div className="App">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeCanvasObject={({ img, x, y }, ctx) => {
          const size = 30;
          ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        }}
      />
    </div>
  );
}

export default App;
