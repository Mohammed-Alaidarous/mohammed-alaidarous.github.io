import type { Basis, FoodSource, FoodState, Meal, Nutrients, ProfileInput, Targets, Unit } from './nutrition.js';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  household: { id: string; name: string };
  hasProfile: boolean;
}

export interface Profile extends ProfileInput {
  updated_at: string;
}

export interface ProfileResponse {
  profile: Profile | null;
  targets: Targets | null;
}

export interface Serving {
  id: string;
  label: string;
  amount: number;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  basis: Basis;
  serving_label: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  food_state: FoodState;
  source: FoodSource;
  source_note: string | null;
  barcode: string | null;
  servings: Serving[];
  created_by_me: boolean;
  last_used_at: string | null;
  updated_at: string;
}

export interface FoodSnapshot {
  basis: Basis;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  serving_label: string | null;
  servings: Serving[];
  food_state: FoodState;
  source: FoodSource;
}

export interface LogEntry extends Nutrients {
  id: string;
  log_date: string;
  meal: Meal;
  entry_type: 'food' | 'quick';
  food_id: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  serving_label: string | null;
  serving_amount: number | null;
  food_snapshot: FoodSnapshot | null;
  created_at: string;
}

export interface DayLog {
  date: string;
  entries: LogEntry[];
  totals: Nutrients;
  targets: Targets | null;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  maxMembers: number;
  members: { displayName: string; isMe: boolean }[];
}

export interface ApiErrorBody {
  error: string;
  issues?: { path: string; message: string }[];
}
