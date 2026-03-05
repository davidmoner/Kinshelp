'use strict';
const repo = require('../admin/admin.repo');

function parseValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  try { return JSON.parse(String(v)); } catch { return v; }
}

function normalizeConfig(raw) {
  const cfg = raw || {};
  const fxRaw = parseValue(cfg.fx_level);
  const fx = (fxRaw === 'off' || fxRaw === 'subtle' || fxRaw === 'wow') ? fxRaw : 'wow';

  const durRaw = parseValue(cfg.hero_banner_duration);
  const durNum = Number(durRaw);
  const heroDuration = Number.isFinite(durNum) && durNum > 0 ? durNum : null;

  const legalRaw = parseValue(cfg.legal_mode);
  const legalMode = legalRaw === true || legalRaw === 1 || legalRaw === 'true';

  return {
    fx_level: fx,
    hero_banner_duration: heroDuration,
    legal_mode: legalMode,
  };
}

const getPublicConfig = (req, res, next) => {
  Promise.resolve(repo.getConfig())
    .then(cfg => res.json({ ok: true, data: normalizeConfig(cfg) }))
    .catch(next);
};

module.exports = { getPublicConfig };
