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
  try {
    const data = validators.validateCheckout(req.body);
    const out = svc.createCheckoutSession(req.user.id, data);
    // 501 signals "not implemented" but endpoint exists
    res.status(501).json(out);
  } catch (e) {
    next(e);
  }
};

const eligibility = (req, res, next) => {
  try {
    res.json(svc.eligibility(req.user.id));
  } catch (e) {
    next(e);
  }
};

const unlockByReputation = (req, res, next) => {
  try {
    res.json(svc.unlockByReputation(req.user.id));
  } catch (e) {
    next(e);
  }
};

module.exports = { getPlans, checkout, eligibility, unlockByReputation };
