import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';

// Projects are per user, so a new user needs one of their own before they can log time.
export const DEFAULT_PROJECT_NAME = 'Arbete';

export function createDefaultProject(userId: number) {
  db.insert(projects).values({ userId, name: DEFAULT_PROJECT_NAME }).run();
}
