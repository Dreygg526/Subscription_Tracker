// Pure logic: validating what the onboarding wizard collects.
//
// Kept out of the component so the rules can be tested without a browser, and
// so the client and the server action check the same thing rather than drifting.

// Relative and extension-explicit, not the @/ alias: scripts/test.mjs imports
// this module directly with plain Node, which resolves neither tsconfig path
// aliases nor extensionless specifiers.
import { daysForBundle } from './bundles.ts';

export const GENDERS = ['male', 'female', 'other', 'prefer-not-to-say'] as const;
export type Gender = (typeof GENDERS)[number];

export const MIN_PASSWORD = 8;

export type OnboardingInput = {
  fullName: string;
  age: string;
  gender: string;
  bundleId: string;
  orderEmail: string;
  email: string;
  password: string;
};

export type FieldErrors = Partial<Record<keyof OnboardingInput, string>>;

/** Deliberately loose. The authority on whether an address works is the inbox. */
export function isEmailish(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validates one step's worth of fields, or all of them.
 *
 * Returns a message per bad field rather than a single string, so the wizard can
 * put each error under the input it belongs to.
 */
export function validateOnboarding(
  input: Partial<OnboardingInput>,
  fields: (keyof OnboardingInput)[]
): FieldErrors {
  const errors: FieldErrors = {};
  const get = (key: keyof OnboardingInput) => (input[key] ?? '').trim();

  for (const field of fields) {
    switch (field) {
      case 'fullName': {
        const name = get('fullName');
        if (!name) errors.fullName = 'Tell us what to call you.';
        else if (name.length > 80) errors.fullName = 'That is longer than 80 characters.';
        break;
      }

      case 'age': {
        // Optional -- but a wrong number is worse than no number.
        const raw = get('age');
        if (!raw) break;
        const age = Number(raw);
        if (!Number.isInteger(age) || age < 13 || age > 120) {
          errors.age = 'Enter an age between 13 and 120, or leave it blank.';
        }
        break;
      }

      case 'gender': {
        const gender = get('gender');
        if (gender && !GENDERS.includes(gender as Gender)) {
          errors.gender = 'Pick one of the options.';
        }
        break;
      }

      case 'bundleId': {
        if (!daysForBundle(get('bundleId'))) {
          errors.bundleId = 'Choose the bundle you bought.';
        }
        break;
      }

      case 'orderEmail': {
        const value = get('orderEmail');
        if (!value) errors.orderEmail = 'We need the email you used at checkout.';
        else if (!isEmailish(value)) errors.orderEmail = 'That does not look like an email address.';
        break;
      }

      case 'email': {
        const value = get('email');
        if (!value) errors.email = 'Enter an email address.';
        else if (!isEmailish(value)) errors.email = 'That does not look like an email address.';
        break;
      }

      case 'password': {
        const value = input.password ?? '';
        if (!value) errors.password = 'Choose a password.';
        else if (value.length < MIN_PASSWORD) {
          errors.password = `Use at least ${MIN_PASSWORD} characters.`;
        }
        break;
      }
    }
  }

  return errors;
}

export const ALL_FIELDS: (keyof OnboardingInput)[] = [
  'fullName',
  'age',
  'gender',
  'bundleId',
  'orderEmail',
  'email',
  'password',
];
