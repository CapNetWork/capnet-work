const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function parsePagination(query) {
  const limit = Math.min(
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  return { limit, offset };
}

module.exports = { parsePagination };
