import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

// T36: accounts against the dev database — register, password check and the
// default user. Every user created here has a random @test.local email and
// is deleted afterwards. (The HTTP side — login page, 401, redirects — is
// checked against the running app; Auth.js only runs inside Next.js.)

let users: typeof import("../src/lib/users");
let dbModule: typeof import("../src/lib/db");
let schema: typeof import("../src/lib/db/schema");
let drizzle: typeof import("drizzle-orm");

const testEmail = () => `user-${randomUUID()}@test.local`;
const password = "correct horse 9";

before(async () => {
  users = await import("../src/lib/users");
  dbModule = await import("../src/lib/db");
  schema = await import("../src/lib/db/schema");
  drizzle = await import("drizzle-orm");
});

after(async () => {
  const { like } = drizzle;
  await dbModule.db.delete(schema.users).where(like(schema.users.email, "%@test.local"));
  await dbModule.db.$client.end();
});

async function findUser(email: string) {
  const [row] = await dbModule.db
    .select()
    .from(schema.users)
    .where(drizzle.eq(schema.users.email, email));
  return row;
}

describe("accounts", () => {
  test("register stores a bcrypt hash, never the password, and a normalised email", async () => {
    const email = testEmail();
    const { id } = await users.registerUser(`  ${email.toUpperCase()} `, password);
    const row = await findUser(email);
    assert.equal(row.id, id);
    assert.match(row.passwordHash, /^\$2[aby]\$12\$/); // bcrypt, cost 12
    assert.ok(!row.passwordHash.includes(password));
  });

  test("the same email cannot register twice (any letter case)", async () => {
    const email = testEmail();
    await users.registerUser(email, password);
    await assert.rejects(users.registerUser(email.toUpperCase(), password), users.RegisterError);
  });

  test("bad input is refused with a readable message", async () => {
    assert.match(users.validateCredentials("not-an-email", password) ?? "", /valid email/);
    assert.match(users.validateCredentials(testEmail(), "short") ?? "", /at least 8/);
    assert.equal(users.validateCredentials(testEmail(), password), null);
    await assert.rejects(users.registerUser("nope", password), users.RegisterError);
  });

  test("login check: right password only; unknown email and wrong password look the same", async () => {
    const email = testEmail();
    const { id } = await users.registerUser(email, password);
    assert.deepEqual(await users.verifyUser(email.toUpperCase(), password), { id, email });
    assert.equal(await users.verifyUser(email, "wrong password"), null);
    assert.equal(await users.verifyUser(testEmail(), password), null);
  });

  test("an account whose hash is not bcrypt (the old dev user's \"!\") can never log in", async () => {
    const email = testEmail();
    await dbModule.db.insert(schema.users).values({ email, passwordHash: "!" });
    assert.equal(await users.verifyUser(email, "!"), null);
  });
});

describe("default user", () => {
  const saved = { ...process.env };
  after(() => {
    process.env.DEFAULT_USER_EMAIL = saved.DEFAULT_USER_EMAIL;
    process.env.DEFAULT_USER_PASSWORD = saved.DEFAULT_USER_PASSWORD;
  });

  test("is created from .env, is idempotent, and its password works", async () => {
    const email = testEmail();
    process.env.DEFAULT_USER_EMAIL = email;
    process.env.DEFAULT_USER_PASSWORD = password;

    const first = await users.ensureDefaultUser();
    const second = await users.ensureDefaultUser();
    assert.equal(second.id, first.id);
    assert.equal((await users.verifyUser(email, password))?.id, first.id);
  });

  test("a changed DEFAULT_USER_PASSWORD resets the password, keeping the same account", async () => {
    const email = testEmail();
    process.env.DEFAULT_USER_EMAIL = email;
    process.env.DEFAULT_USER_PASSWORD = password;
    const { id } = await users.ensureDefaultUser();

    process.env.DEFAULT_USER_PASSWORD = "a new password 1";
    assert.equal((await users.ensureDefaultUser()).id, id);
    assert.equal(await users.verifyUser(email, password), null);
    assert.equal((await users.verifyUser(email, "a new password 1"))?.id, id);
  });

  test("the old dev@localhost user is converted, so its documents keep their owner", async () => {
    // Skip if a real dev@localhost row exists — this test must not convert it.
    if (await findUser("dev@localhost")) return;
    const [dev] = await dbModule.db
      .insert(schema.users)
      .values({ email: "dev@localhost", passwordHash: "!" })
      .returning({ id: schema.users.id });
    try {
      const email = testEmail();
      process.env.DEFAULT_USER_EMAIL = email;
      process.env.DEFAULT_USER_PASSWORD = password;
      const user = await users.ensureDefaultUser();
      assert.equal(user.id, dev.id); // same row -> same documents
      assert.equal(await findUser("dev@localhost"), undefined);
      assert.equal((await users.verifyUser(email, password))?.id, dev.id);
    } finally {
      await dbModule.db.delete(schema.users).where(drizzle.eq(schema.users.id, dev.id));
    }
  });

  test("an invalid DEFAULT_USER_* in .env stops with a clear error", async () => {
    process.env.DEFAULT_USER_EMAIL = testEmail();
    process.env.DEFAULT_USER_PASSWORD = "short";
    await assert.rejects(users.ensureDefaultUser(), /DEFAULT_USER_EMAIL \/ DEFAULT_USER_PASSWORD/);
  });
});
