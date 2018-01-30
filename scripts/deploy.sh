#!/bin/sh
set -e

$(aws ecr get-login --no-include-email --region us-west-2)
docker build -t thin-auth .
docker tag thin-auth:latest 463276750455.dkr.ecr.us-west-2.amazonaws.com/thin-auth:latest
docker push 463276750455.dkr.ecr.us-west-2.amazonaws.com/thin-auth:latest
