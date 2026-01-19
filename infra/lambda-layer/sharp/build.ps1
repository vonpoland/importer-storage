docker run --rm -v ${PWD}:/work -w /work public.ecr.aws/sam/build-nodejs22.x `
  bash -c "npm install sharp --no-audit --no-fund && mkdir -p nodejs && cp -R node_modules nodejs/"
