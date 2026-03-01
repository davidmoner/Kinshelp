'use strict';
const pointsService = require('./points.service');

const getMyPoints = (req, res, next) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const data = pointsService.getLedger(req.user.id, { limit: +limit, offset: +offset });
        res.json(data);
    } catch (e) { next(e); }
};

const getUserPoints = (req, res, next) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const data = pointsService.getLedger(req.params.userId, { limit: +limit, offset: +offset });
        res.json(data);
    } catch (e) { next(e); }
};

const leaderboard = (req, res, next) => {
    try {
        const { limit = 10, offset = 0, lat, lng, radius_km, sort, min_level, q } = req.query;
        res.json(pointsService.leaderboard({
            limit: +limit,
            offset: +offset,
            lat: lat !== undefined ? +lat : undefined,
            lng: lng !== undefined ? +lng : undefined,
            radius_km: radius_km !== undefined ? +radius_km : undefined,
            sort: sort !== undefined ? String(sort) : undefined,
            min_level: min_level !== undefined ? String(min_level) : undefined,
            q: q !== undefined ? String(q) : undefined,
        }));
    } catch (e) { next(e); }
};

const leaderboardMe = (req, res, next) => {
    try {
        const { lat, lng, radius_km, min_level } = req.query;
        res.json(pointsService.leaderboardMe(req.user.id, {
            lat: lat !== undefined ? +lat : undefined,
            lng: lng !== undefined ? +lng : undefined,
            radius_km: radius_km !== undefined ? +radius_km : undefined,
            min_level: min_level !== undefined ? String(min_level) : undefined,
        }));
    } catch (e) { next(e); }
};

module.exports = { getMyPoints, getUserPoints, leaderboard, leaderboardMe };
