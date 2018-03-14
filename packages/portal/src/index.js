// @flow
import React from "react"
import ReactDOM from "react-dom"
import "./index.css"

import Root from "./components/Root"

let root = document.getElementById("root")
if (!root) throw new Error("root element not found")
ReactDOM.render(<Root />, root)
