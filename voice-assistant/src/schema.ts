import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  transcript: text("transcript"),
  llmPlanJson: text("llm_plan_json"),
  createdAt: integer("created_at").notNull(),
});

export const actionLog = sqliteTable("action_log", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  actionType: text("action_type").notNull(),
  paramsJson: text("params_json").notNull(),
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
});

export const sessionsRelations = relations(sessions, () => ({}));
export const messagesRelations = relations(messages, () => ({}));
export const actionLogRelations = relations(actionLog, () => ({}));
