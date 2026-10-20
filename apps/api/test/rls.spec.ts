/**
 * Testes de RLS direto no banco, sem passar pela API: simulam alguém usando a
 * chave pública do Supabase (PostgREST) ou um bug que esqueça um filtro.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminPool } from './helpers.js';

interface U {
  id: string;
  email: string;
}

async function newUser(label: string): Promise<U> {
  const id = randomUUID();
  const email = `${label}.${id.slice(0, 6)}@rls.test`;
  await adminPool.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  return { id, email };
}

/** Executa SQL como o usuário (papel authenticated + claims), sempre com rollback. */
async function as<T>(user: U | 'anon', fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    if (user === 'anon') {
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      await client.query('set local role anon');
    } else {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }),
      ]);
      await client.query('set local role authenticated');
    }
    return await fn(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

let adminA: U;
let viewerA: U;
let adminB: U;
let tenantA: string;
let tenantB: string;
let studentA: string;

beforeAll(async () => {
  adminA = await newUser('admin-a');
  viewerA = await newUser('viewer-a');
  adminB = await newUser('admin-b');

  tenantA = (
    await adminPool.query(`insert into tenants (name, type) values ('A', 'school') returning id`)
  ).rows[0].id;
  tenantB = (
    await adminPool.query(
      `insert into tenants (name, type) values ('B', 'professional') returning id`,
    )
  ).rows[0].id;
  await adminPool.query(
    `insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'viewer'), ($4, $5, 'admin')`,
    [tenantA, adminA.id, viewerA.id, tenantB, adminB.id],
  );
  studentA = (
    await adminPool.query(
      `insert into students (tenant_id, full_name, conditions) values ($1, 'Aluno A', '{TDAH}') returning id`,
      [tenantA],
    )
  ).rows[0].id;
  await adminPool.query(
    `insert into student_staff (student_id, tenant_id, user_id, function) values ($1, $2, $3, 'regente')`,
    [studentA, tenantA, viewerA.id],
  );
});

afterAll(async () => {
  await adminPool.end();
});

describe('RLS', () => {
  it('outra conta não lê alunos, mesmo sem filtro', async () => {
    const rows = await as(adminB, async (c) => (await c.query('select * from students')).rows);
    expect(rows).toEqual([]);
  });

  it('anônimo não lê nenhuma tabela', async () => {
    await expect(as('anon', (c) => c.query('select * from students'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as('anon', (c) => c.query('select * from family_links'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('ninguém se adiciona como membro de outra conta', async () => {
    await expect(
      as(adminB, (c) =>
        c.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')`, [
          tenantA,
          adminB.id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('admin não move a própria associação para outra conta', async () => {
    await expect(
      as(adminB, (c) =>
        c.query(`update memberships set tenant_id = $1 where user_id = $2`, [tenantA, adminB.id]),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/);
  });

  it('admin não cria aluno em conta alheia', async () => {
    await expect(
      as(adminB, (c) =>
        c.query(`insert into students (tenant_id, full_name, created_by) values ($1, 'X', $2)`, [
          tenantA,
          adminB.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('viewer lê o aluno vinculado mas não altera nem cria PEI', async () => {
    const rows = await as(viewerA, async (c) => (await c.query('select id from students')).rows);
    expect(rows.map((r) => r.id)).toEqual([studentA]);

    const updated = await as(
      viewerA,
      async (c) =>
        (await c.query(`update students set notes = 'x' where id = $1`, [studentA])).rowCount,
    );
    expect(updated).toBe(0);

    await expect(
      as(viewerA, (c) =>
        c.query(
          `insert into peis (tenant_id, student_id, school_year, created_by) values ($1, $2, 2026, $3)`,
          [tenantA, studentA, viewerA.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('chave composta impede PEI apontando aluno de outra conta', async () => {
    await expect(
      adminPool.query(
        `insert into peis (tenant_id, student_id, school_year) values ($1, $2, 2026)`,
        [tenantB, studentA],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('auditoria só é visível para administradores da própria conta', async () => {
    const forViewer = await as(
      viewerA,
      async (c) => (await c.query('select * from audit_log')).rows,
    );
    expect(forViewer).toEqual([]);
    const forAdminB = await as(
      adminB,
      async (c) => (await c.query('select * from audit_log where tenant_id = $1', [tenantA])).rows,
    );
    expect(forAdminB).toEqual([]);
    const forAdminA = await as(
      adminA,
      async (c) =>
        (
          await c.query(
            `select * from audit_log where tenant_id = $1 and table_name = 'students'`,
            [tenantA],
          )
        ).rows,
    );
    expect(forAdminA.length).toBeGreaterThan(0);
  });

  it('funções privadas não são executáveis por anon além do portal', async () => {
    await expect(
      as('anon', (c) => c.query(`select private.create_tenant('X', 'school')`)),
    ).rejects.toThrow(/permission denied/);
  });
});
