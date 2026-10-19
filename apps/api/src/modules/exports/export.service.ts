import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { AuthUser } from '../../auth/auth.types.js';
import { DbService } from '../../db/db.service.js';
import { PeisService } from '../peis/peis.service.js';
import { StudentsService } from '../students/students.service.js';
import { buildPeiDocument } from './document-model.js';
import { renderDocx } from './render-docx.js';
import { renderPdf } from './render-pdf.js';

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Gera o documento na hora (síncrono, < 2 s): nada fica guardado em storage.
 * Cada exportação vai para a trilha de auditoria.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly db: DbService,
    private readonly peis: PeisService,
    private readonly students: StudentsService,
  ) {}

  async export(
    user: AuthUser,
    tenantId: string,
    peiId: string,
    format: 'pdf' | 'docx',
  ): Promise<ExportedFile> {
    const { pei, student, tenantName } = await this.db.asUser(user, async (trx) => {
      const pei = await this.peis.findIn(trx, tenantId, peiId);
      const student = await this.students.findIn(trx, tenantId, pei.studentId);
      const tenant = await trx
        .selectFrom('tenants')
        .select('name')
        .where('id', '=', tenantId)
        .executeTakeFirstOrThrow();
      await sql`select private.log_event(${tenantId}::uuid, 'export', 'peis', ${peiId}, ${JSON.stringify({ format })}::jsonb)`.execute(
        trx,
      );
      return { pei, student, tenantName: tenant.name };
    });

    const model = buildPeiDocument({ pei, student, tenantName, generatedAt: new Date() });
    const base = `PEI_${slug(student.fullName)}_${pei.schoolYear}_v${pei.version}`;

    return format === 'pdf'
      ? { buffer: await renderPdf(model), contentType: 'application/pdf', filename: `${base}.pdf` }
      : {
          buffer: await renderDocx(model),
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: `${base}.docx`,
        };
  }
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
