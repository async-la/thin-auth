// @flow
import React, { Component } from "react"
import PropTypes from "prop-types"
import { css } from "glamor"

import queryString from "query-string"
import { authRemote } from "../remotes"

const VERIFY_ERROR = "An error occurred."
const VERIFY_SUCCESS = "Authentication Approved."
const ABORT_SUCCESS = "Authentication Aborted."

type State = {
  result: ?string
}
class App extends Component<{}, State> {
  state = { result: null }

  verify = async () => {
    try {
      let authApi = await authRemote()
      let cipher = queryString.parse(window.location.search).cipher
      await authApi.approveAuth(cipher)
      this.setState({ result: VERIFY_SUCCESS })
    } catch (err) {
      console.error(err)
      this.setState({ result: VERIFY_ERROR })
    }
  }

  abort = async () => {
    try {
      let authApi = await authRemote()
      let cipher = queryString.parse(window.location.search).cipher
      authApi.rejectAuth(cipher)
    } catch (err) {
      console.error(err)
    }
    this.setState({ result: ABORT_SUCCESS })
  }

  render() {
    let { result } = this.state
    return (
      <div {...container}>
        <div {...resultContainer} {...(result ? show : hide)}>
          {result}
        </div>
        <button {...verifyButton} {...result && hideLeft} onClick={this.verify}>
          Verify
        </button>
        <br />
        <button {...abortButton} {...result && hideRight} onClick={this.abort}>
          Not You?
        </button>
      </div>
    )
  }
}

export default App

const container = css({
  display: "flex",
  alignItems: "center",
  flex: 1,
  flexDirection: "column",
  justifyContent: "center",
  minHeight: "100vh"
})
const verifyButton = css({
  background: "black",
  color: "white",
  fontSize: 16,
  border: "1px solid #555",
  padding: "10px 20px",
  borderRadius: 3,
  cursor: "pointer"
})
const abortButton = css({
  background: "none",
  border: "none",
  cursor: "pointer"
})
const hideLeft = css({
  opacity: 0,
  marginRight: 100,
  marginTop: -100,
  transitionDuration: "1s"
})
const hideRight = css({
  opacity: 0,
  marginLeft: 100,
  marginTop: 200,
  transitionDuration: "1s"
})
const show = css({
  opacity: 1
})
const hide = css({
  opacity: 0
})
const resultContainer = css({
  position: "absolute",
  transitionDuration: "1s"
})
