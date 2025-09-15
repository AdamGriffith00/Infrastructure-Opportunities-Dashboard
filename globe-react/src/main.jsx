import React from "react";
import ReactDOM from "react-dom/client";
import InteractiveGlobe from "./InteractiveGlobe.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="app">
      <InteractiveGlobe />
    </div>
  </React.StrictMode>
);
