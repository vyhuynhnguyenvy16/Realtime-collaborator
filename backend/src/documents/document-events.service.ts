import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/** In-process notifications the realtime gateway reacts to. */
export type DocumentChange =
  | { type: 'access-revoked'; documentId: string; userId: string }
  | { type: 'role-changed'; documentId: string; userId: string; role: string }
  | { type: 'renamed'; documentId: string; title: string }
  | { type: 'deleted'; documentId: string };

@Injectable()
export class DocumentEventsService {
  readonly changes = new Subject<DocumentChange>();

  emit(change: DocumentChange) {
    this.changes.next(change);
  }
}
