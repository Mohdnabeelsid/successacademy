// Custom ESM loader for Node.js to resolve https:// CDN imports in test environment
export async function load(url, context, nextLoad) {
  if (url.startsWith("https://")) {
    const res = await fetch(url);
    const source = await res.text();
    return {
      format: "module",
      shortCircuit: true,
      source
    };
  }
  return nextLoad(url, context);
}
