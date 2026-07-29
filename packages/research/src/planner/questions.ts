export const PLANNER_QUESTIONS = [
  "Is the organization a credible D2L Brightspace fit?",
  "Does the contact’s current role plausibly own or influence learning, credentialing, education, member programs, workforce learning, or technology?",
  "Is new-role tenure actually verified?",
  "Does the organization serve external learners, members, customers, partners, or employees?",
  "Is there a current initiative, event, hiring, platform, regulatory, funding, or strategy signal?",
  "Is there duplicate seller motion, active ownership, or suppression risk?",
  "Is there enough evidence for a responsible why-now angle?",
  "Is there enough use-case evidence for a customer-story match?",
  "What single missing fact could most change the decision?",
] as const;

export type PlannerQuestion = (typeof PLANNER_QUESTIONS)[number];
