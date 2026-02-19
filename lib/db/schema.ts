import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  salaryType: text('salary_type', { enum: ['hourly', 'monthly'] }).notNull().default('hourly'),
  hourlyRate: real('hourly_rate'),
  monthlySalary: real('monthly_salary'),
  overtimeRate: real('overtime_rate'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const timeEntries = sqliteTable('time_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  projectId: integer('project_id').notNull().references(() => projects.id),
  date: text('date').notNull(),
  hours: real('hours').notNull(),
  startTime: text('start_time'), // HH:MM format
  endTime: text('end_time'), // HH:MM format
  breakMinutes: integer('break_minutes').default(0),
  entryType: text('entry_type', { enum: ['work', 'sick'] }).notNull().default('work'),
  overtimeType: text('overtime_type', { enum: ['none', 'mertid', 'enkel', 'kvalificerad'] }).notNull().default('none'),
  description: text('description'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Keep old table for reference but new settings go in userSettings
export const salarySettings = sqliteTable('salary_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  workingHoursPerMonth: real('working_hours_per_month').notNull().default(160),
});

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  workplaceType: text('workplace_type', { enum: ['butik', 'lager', 'none'] }).notNull().default('none'),
  contractLevel: text('contract_level').notNull().default('3plus'),
  taxRate: real('tax_rate').notNull().default(30),
  vacationPayRate: real('vacation_pay_rate').notNull().default(12),
  vacationPayMode: text('vacation_pay_mode', { enum: ['included', 'separate'] }).notNull().default('included'),
  workingHoursPerMonth: real('working_hours_per_month').notNull().default(160),
  autoBreakCalc: integer('auto_break_calc', { mode: 'boolean' }).notNull().default(true),
  employeeName: text('employee_name'),
  employerName: text('employer_name'),
  defaultStartTime: text('default_start_time'),
  defaultEndTime: text('default_end_time'),
  calendarViewDefault: text('calendar_view_default', { enum: ['week', 'month'] }).notNull().default('week'),
  taxMode: text('tax_mode').notNull().default('percentage'),
  taxTable: integer('tax_table'),
  municipality: text('municipality'),
});

export const workTemplates = sqliteTable('work_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  breakMinutes: integer('break_minutes').notNull().default(0),
});

export const weeklySchedule = sqliteTable('weekly_schedule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Monday, 6=Sunday
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  breakMinutes: integer('break_minutes').notNull().default(0),
});

export const vacationPayWithdrawals = sqliteTable('vacation_pay_withdrawals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: real('amount').notNull(),
  tax: real('tax').notNull().default(0),
  netAmount: real('net_amount').notNull().default(0),
  note: text('note'),
  withdrawnAt: text('withdrawn_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const vacationPayInclusions = sqliteTable('vacation_pay_inclusions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  month: text('month').notNull(), // YYYY-MM (arbetsperiod)
  includeInSalary: integer('include_in_salary', { mode: 'boolean' }).notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type SalarySetting = typeof salarySettings.$inferSelect;
export type UserSetting = typeof userSettings.$inferSelect;
export type WorkTemplate = typeof workTemplates.$inferSelect;
export type WeeklyScheduleEntry = typeof weeklySchedule.$inferSelect;
export type VacationPayWithdrawal = typeof vacationPayWithdrawals.$inferSelect;
export type VacationPayInclusion = typeof vacationPayInclusions.$inferSelect;
