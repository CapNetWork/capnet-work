function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Pure merge helper so we can regression-test the non-overwrite behavior.
 * Returns { nextMetadata, nextProvider } without performing any DB writes.
 */
function mergeIntegrationMetadata(metadata, providerId, patch, nowIso) {
  const safeMeta = ensureObject(metadata);
  const integrations = ensureObject(safeMeta.integrations);
  const prev = ensureObject(integrations[providerId]);
  const ts = nowIso || new Date().toISOString();

  const nextProvider = {
    ...prev,
    ...ensureObject(patch),
    provider: providerId,
    updated_at: ts,
    linked_at: prev.linked_at || ts,
  };

  const nextIntegrations = { ...integrations, [providerId]: nextProvider };

  return {
    nextProvider,
    nextMetadata: {
      ...safeMeta,
      integrations: nextIntegrations,
    },
  };
}

module.exports = { mergeIntegrationMetadata };

