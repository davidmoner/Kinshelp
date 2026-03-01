'use strict';

// Categories exposed in UI (keep stable; used for matching)
const CATEGORIES = [
    'repairs',
    'packages',
    'pets',
    'cleaning',
    'transport',
    'tech',
    'gardening',
    'care',
    'tutoring',
    'creative',
    'errands',
    'other',
];

const OFFER_STATUS = {
    ACTIVE: 'active',
    MATCHED: 'matched',
    CLOSED: 'closed',
    EXPIRED: 'expired',
};

const REQUEST_STATUS = {
    OPEN: 'open',
    MATCHED: 'matched',
    CLOSED: 'closed',
    EXPIRED: 'expired',
};

const MATCH_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DONE: 'done',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
};

const PREMIUM_TIER = {
    FREE: 'free',
    PREMIUM: 'premium',
    // Backward compat
    SILVER: 'silver',
    GOLD: 'gold',
};

// Premium tier sort weight (higher = ranked first)
const PREMIUM_WEIGHT = {
    premium: 2,
    gold: 2,
    silver: 2,
    free: 1,
};

const LEDGER_REASON = {
    MATCH_COMPLETED: 'match_completed',
    MATCH_COMPLETED_LIMITED: 'match_completed_limited',
    MATCH_ACCEPTED: 'match_accepted',
    MATCH_CANCELLED: 'match_cancelled',
    ADMIN_GRANT: 'admin_grant',
    PURCHASE: 'purchase',
    REFUND: 'refund',
    BADGE_BONUS: 'badge_bonus',
};

// Reputation system (points_balance is treated as reputation)
const REPUTATION_AWARD = {
    // Always earned by both parties on completion
    match_done: {
        altruistic: { provider: 22, seeker: 12 },
        barter: { provider: 16, seeker: 9 },
        cash: { provider: 12, seeker: 6 },
    },
    // Small reward for responsiveness
    match_accepted: { provider: 2, seeker: 0 },
};

const PREMIUM_UNLOCK_REPUTATION = 1000;

// Anti-fraud (MVP): lightweight friction to reduce farming
// - Require a minimal real chat (non-system message from both sides)
// - Limit repeated reputation awards between the same pair in a short window
const ANTI_FRAUD_MIN_CHAT_MSG_EACH = 1;
const ANTI_FRAUD_PAIR_WINDOW_DAYS = 30;
const ANTI_FRAUD_PAIR_MAX_FULL_AWARDS = 1; // 1 full award per pair per window

// Premium unlock: require multiple distinct neighbors completed with
const PREMIUM_UNLOCK_MIN_DISTINCT_PARTNERS = 8;

// Media limits
const PROFILE_MAX_PHOTOS = 2;
const LISTING_MAX_PHOTOS = 6;

// AutoMatch (Premium)
const AUTOMATCH_INVITE_TTL_MINUTES = 12;
const AUTOMATCH_MAX_INVITES_PER_REQUEST = 6;
const AUTOMATCH_MAX_PENDING_PER_PROVIDER = 4;
const AUTOMATCH_MAX_PENDING_PER_USER = 4;

// Valid match status transitions: { fromStatus: { action: toStatus } }
const MATCH_TRANSITIONS = {
    pending: {
        accept: 'accepted',   // provider only
        reject: 'rejected',   // provider only
        cancel: 'rejected',   // seeker only – stored as rejected with cancellation flag
    },
    accepted: {
        done: 'done',         // provider only
        cancel: 'rejected',   // seeker only
    },
};

// Which roles can perform which actions
const MATCH_ACTION_PERMISSIONS = {
    accept: 'provider',
    reject: 'provider',
    done: 'provider',
    cancel: 'seeker',
};

module.exports = {
    CATEGORIES,
    OFFER_STATUS,
    REQUEST_STATUS,
    MATCH_STATUS,
    PREMIUM_TIER,
    PREMIUM_WEIGHT,
    LEDGER_REASON,
    REPUTATION_AWARD,
    PREMIUM_UNLOCK_REPUTATION,
    ANTI_FRAUD_MIN_CHAT_MSG_EACH,
    ANTI_FRAUD_PAIR_WINDOW_DAYS,
    ANTI_FRAUD_PAIR_MAX_FULL_AWARDS,
    PREMIUM_UNLOCK_MIN_DISTINCT_PARTNERS,
    PROFILE_MAX_PHOTOS,
    LISTING_MAX_PHOTOS,
    AUTOMATCH_INVITE_TTL_MINUTES,
    AUTOMATCH_MAX_INVITES_PER_REQUEST,
    AUTOMATCH_MAX_PENDING_PER_PROVIDER,
    AUTOMATCH_MAX_PENDING_PER_USER,
    MATCH_TRANSITIONS,
    MATCH_ACTION_PERMISSIONS,
};
