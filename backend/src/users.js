import bcrypt from "bcryptjs";

const BCRYPT_COST = 10;

export const SEED_USERS = [
  { id: "1", email: "alice@example.com", password: "Password123!" },
  { id: "2", email: "bob@example.com", password: "Password456!" },
];

/**
 * @typedef {{ id: string, email: string, passwordHash: string }} User
 */

/**
 * @param {{ id: string, email: string, password: string }[]} [seed]
 */
export async function createUserStore(seed = SEED_USERS) {
  /** @type {User[]} */
  const users = await Promise.all(
    seed.map(async ({ id, email, password }) => ({
      id,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
    })),
  );
  // Compared against when the user is unknown, so timing does not reveal it.
  const dummyHash = await bcrypt.hash("dummy-password", BCRYPT_COST);

  return {
    /** @param {string} email */
    findByEmail: (email) => users.find((u) => u.email === email),
    /** @param {string} id */
    findById: (id) => users.find((u) => u.id === id),
    /**
     * @param {User | undefined} user
     * @param {string} password
     */
    async verifyPassword(user, password) {
      const matches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
      return Boolean(user) && matches;
    },
  };
}
