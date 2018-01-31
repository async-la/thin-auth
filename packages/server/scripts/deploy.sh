#!/bin/sh
set -e

$(aws ecr get-login --no-include-email --region us-west-2)
docker build -t thin-auth .
docker tag thin-auth:latest 463276750455.dkr.ecr.us-west-2.amazonaws.com/thin-auth:latest
docker push 463276750455.dkr.ecr.us-west-2.amazonaws.com/thin-auth:latest
echo "Container pushed. In order for the container to go live, the existing pod will need to be deleted: https://github.com/async-la/thin-auth/wiki/Deployment"
