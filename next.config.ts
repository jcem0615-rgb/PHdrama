import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The built-in narrator is espeak-ng compiled to WASM. It must stay external:
  // bundling it rewrites the module's __dirname, the runtime then looks for
  // espeak-ng.wasm under /ROOT, and emscripten answers a missing file with
  // abort() — which takes the process down rather than throwing.
  serverExternalPackages: ['text2wav'],

  // Next's tracer cannot see a .wasm loaded at runtime, so name it explicitly
  // or the deployed function ships without it.
  outputFileTracingIncludes: {
    '/api/admin/narrate': ['./node_modules/text2wav/lib/**'],
  },
};

export default nextConfig;
