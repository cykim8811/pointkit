#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $(kubectl config current-context) != gke_coders-497813_asia-northeast3-b_coders-prod-1 ]]; then
  echo 'Select the intended GKE cluster.' >&2
  exit 1
fi
image="asia-northeast3-docker.pkg.dev/coders-497813/platform-images/pointkit:$(date -u +%Y%m%d%H%M%S)"
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://asia-northeast3-docker.pkg.dev
docker build --platform linux/amd64 -t "$image" .
docker push "$image"
kubectl -n coders-system create secret generic pointkit-env --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -
sed "s|asia-northeast3-docker.pkg.dev/coders-497813/platform-images/pointkit:initial|$image|" deploy/gke.yaml | kubectl apply -f -
kubectl -n coders-system rollout status deployment/pointkit --timeout=240s
kubectl -n coders-system wait --for=condition=Ready certificate/pointkit --timeout=300s
kubectl -n coders-system wait --for=condition=Ready ingresses.networking.internal.knative.dev/pointkit --timeout=120s
curl --fail --silent --show-error https://pointkit.dev/healthz | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"status":"ok"}; print("Pointkit is healthy")'
