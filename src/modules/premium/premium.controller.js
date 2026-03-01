'use strict';
const svc = require('./premium.service');
const validators = require('./premium.validators');

const getPlans = (req, res, next) => {
  try {
    res.json(svc.plans());
  } catch (e) {
    next(e);
  }
};

const checkout = (req, res, next) => {
  (async () => {
    const data = validators.validateCheckout(req.body);
    const out = await svc.createCheckoutSession(req.user, data);
    res.status(out && out.implemented ? 200 : 501).json(out);
  })().catch(next);
};

const webhook = (req, res, next) => {
  (async () => {
    const out = await svc.handleWebhook(req);
    res.status(200).json(out);
  })().catch(next);
};

const eligibility = (req, res, next) => {
  (async () => {
    res.json(await svc.eligibility(req.user.id));
  })().catch(next);
};

const unlockByReputation = (req, res, next) => {
  (async () => {
    res.json(await svc.unlockByReputation(req.user.id));
  })().catch(next);
};

module.exports = { getPlans, checkout, webhook, eligibility, unlockByReputation };
