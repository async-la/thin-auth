// @flow

import os from "os"
import serializeError from "serialize-error"
import winston from "winston"
import WinstonCloudWatch from "winston-cloudwatch"

const LOG_LEVEL_CONSOLE = "info"
const AWS_CLOUDWATCH_ACCESS_KEY = process.env.AWS_CLOUDWATCH_ACCESS_KEY
const AWS_CLOUDWATCH_SECRET_KEY = process.env.AWS_CLOUDWATCH_SECRET_KEY
const AWS_CLOUDWATCH_REGION = process.env.AWS_CLOUDWATCH_REGION

const defaultLogGroupName = "thin-auth"
const defaultLogStreamName = os.hostname()

function createLogger(options = {}) {
  const logStreamName = options.streamName || defaultLogStreamName
  const logGroupName = options.groupName || defaultLogGroupName
  let transports = []

  if (process.NODE_ENV === "production") {
    transports.push(
      new WinstonCloudWatch({
        logStreamName,
        logGroupName,
        level: LOG_LEVEL_CONSOLE,
        awsAccessKeyId: AWS_CLOUDWATCH_ACCESS_KEY,
        awsSecretKey: AWS_CLOUDWATCH_SECRET_KEY,
        awsRegion: AWS_CLOUDWATCH_REGION,
        jsonMessage: false,
        messageFormatter: message => {
          // serializeError produces better serialization, automatically do this when meta is an error
          if (message.meta instanceof Error) message.meta = serializeError(message.meta)
          if (message.meta && message.meta.err instanceof Error)
            message.meta.err = serializeError(message.meta.err)
          return JSON.stringify(message)
        },
      })
    )
  }

  transports.push(
    new winston.transports.Console({
      colorize: true,
      prettyPrint: true,
    })
  )

  const logger = new winston.Logger({ transports })
  logger.create = createLogger

  return logger
}

export default createLogger()
