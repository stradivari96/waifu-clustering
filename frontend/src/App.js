import React, { useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import * as d3 from "d3";

import waifus from "./waifus.json";
import waifu_links from "./waifu_links.json";

const calculateAvg = (arr) => arr.reduce((a, b) => a + b) / arr.length;
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

function App() {
  const fgRef = useRef();
  const size = 30;
  const avgLinkValue = calculateAvg(waifu_links.map((a) => a.value));

  useEffect(() => {
    fgRef.current.d3Force("collide", d3.forceCollide().radius(15));
    fgRef.current.d3Force("link").distance((link) => 300_000 * link.value);
  }, []);

  return (
    <div className="App">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeRelSize={size}
        nodeCanvasObject={({ img, x, y }, ctx) => {
          ctx.fillStyle = "#FFFFFF";
          x = x - size / 2;
          y = y - size / 2;
          ctx.fillRect(x, y, size, size);
          ctx.drawImage(img, x, y, size, size);
        }}
        linkVisibility={(link) => link.value < avgLinkValue}
      />
    </div>
  );
}

export default App;
