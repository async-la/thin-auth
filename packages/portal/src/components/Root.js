// @flow

import React, { Component } from "react"
import PropTypes from "prop-types"

import App from "./App"
import { RemoteUnavailable } from "../errors"

export default class Root extends Component<{}> {
  render() {
    return <App />
  }
}
