import React, { useEffect, useRef, useState } from 'react';
import styles from './ChapterList.module.css';
import EditChapterModal from '../Modals/EditChapterModal';

export interface ChapterRow {
  id: string;
  number: number;
  label: string | null;
  hasCleaned: boolean;
  hasAudio: boolean;
  isRead: boolean;
  isArchived: boolean;
  stage: 'captured' | 'cleaned' | 'queued' | 'cleaning' | 'generating' | 'failed' | 'ready';
  done: number;
  total: number;
  chunksFailed: number;
}

interface ChapterListProps {
  chapters: ChapterRow[];
  selected: string[];
  onSelect: (id: string, selected: boolean) => void;
  onAction: (action: string, ids: string[]) => void;
  onEdit?: (chapter: { id: string; label?: string; text?: string; clearedText?: string }) => void;
  bookId: string;
}

const STAGE_LABEL: Record<ChapterRow['stage'], string> = {
  captured: 'Captured',
  cleaned: 'Cleaned',
  queued: 'Queued',
  cleaning: 'Cleaning text',
  generating: 'Generating audio',
  failed: 'Failed',
  ready: 'Ready',
};

function StagePill({ c }: { c: ChapterRow }) {
  const cls =
    c.stage === 'ready' ? styles.pillOk :
    c.stage === 'failed' ? styles.pillDanger :
    c.stage === 'cleaning' || c.stage === 'generating' || c.stage === 'queued' ? styles.pillActive :
    styles.pillIdle;
  const label =
    c.stage === 'failed' ? `${c.chunksFailed} segment${c.chunksFailed === 1 ? '' : 's'} failed` :
    STAGE_LABEL[c.stage];
  return (
    <span className={[styles.pill, cls].join(' ')}>
      {(c.stage === 'cleaning' || c.stage === 'generating' || c.stage === 'queued') && (
        <span className={styles.spinner} />
      )}
      {label}
      {c.total > 0 && c.stage !== 'ready' && ` · ${c.done}/${c.total}`}
    </span>
  );
}

function Progress({ c }: { c: ChapterRow }) {
  if (!['cleaning', 'generating'].includes(c.stage) || !c.total) return null;
  return (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${(c.done / c.total) * 100}%` }} />
    </div>
  );
}

function RowMenu({ c, onAction, onEditClick }: {
  c: ChapterRow;
  onAction: (action: string, ids: string[]) => void;
  onEditClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const act = (action: string) => { setOpen(false); onAction(action, [c.id]); };
  const busy = ['generating', 'cleaning', 'queued'].includes(c.stage);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button className={styles.menuBtn} onClick={() => setOpen(o => !o)} title="More actions">⋯</button>
      {open && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={() => { setOpen(false); onEditClick(); }}>Edit text</button>
          <button className={styles.menuItem} onClick={() => act(c.isRead ? 'unread' : 'read')}>
            {c.isRead ? 'Mark unread' : 'Mark read'}
          </button>
          <button className={styles.menuItem} onClick={() => act(c.isArchived ? 'unarchive' : 'archive')}>
            {c.isArchived ? 'Unarchive' : 'Archive'}
          </button>
          {!c.hasAudio && !busy && (
            <button className={styles.menuItem} onClick={() => act('audio')}>Generate audio</button>
          )}
          {c.hasAudio && (
            <>
              <button className={styles.menuItem} onClick={() => act('download')}>Download mp3</button>
              <button className={[styles.menuItem, styles.menuItemDanger].join(' ')} onClick={() => act('regenerate')}>
                Regenerate audio
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const GROUPS: { key: string; title: string; filter: (c: ChapterRow) => boolean }[] = [
  { key: 'to-read', title: 'To read', filter: c => !c.isRead && !c.isArchived },
  { key: 'read', title: 'Read', filter: c => c.isRead && !c.isArchived },
  { key: 'archived', title: 'Archived', filter: c => c.isArchived },
];

const ChapterList: React.FC<ChapterListProps> = ({ chapters, selected, onSelect, onAction, onEdit, bookId }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ archived: true });
  const [editing, setEditing] = useState<any | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);

  // Row text isn't in the polled status payload — fetch it when editing
  const openEditor = async (c: ChapterRow) => {
    setLoadingEdit(c.id);
    try {
      const r = await fetch(`/api/chapters?bookId=${bookId}`);
      const all = await r.json();
      const full = Array.isArray(all) ? all.find((x: any) => x.id === c.id) : null;
      if (full) {
        setEditing({
          id: full.id,
          title: full.label || `Chapter ${full.number}`,
          label: full.label,
          number: full.number,
          text: full.text || '',
          clearedText: full.audioText || '',
          cleared: !!full.hasCleaned,
          audioGenerated: !!full.hasAudio,
          status: 'to-read',
        });
      }
    } finally {
      setLoadingEdit(null);
    }
  };

  const toggleGroup = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className={styles.list}>
      {GROUPS.map(g => {
        const items = chapters.filter(g.filter);
        if (items.length === 0) return null;
        const selectedInGroup = items.filter(c => selected.includes(c.id)).length;
        return (
          <section key={g.key} className={styles.group}>
            <header className={styles.groupHeader}>
              <button className={styles.groupToggle} onClick={() => toggleGroup(g.key)}>
                <span className={styles.chevron}>{collapsed[g.key] ? '▸' : '▾'}</span>
                {g.title}
                <span className={styles.groupCount}>{items.length}</span>
              </button>
              <button
                className={styles.groupSelect}
                onClick={() => items.forEach(c => onSelect(c.id, selectedInGroup !== items.length))}
              >
                {selectedInGroup === items.length ? 'Deselect all' : 'Select all'}
              </button>
            </header>

            {!collapsed[g.key] && (
              <div className={styles.rows}>
                {items.map(c => (
                  <div key={c.id} className={[styles.row, c.isRead ? styles.rowRead : ''].join(' ')}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selected.includes(c.id)}
                      onChange={e => onSelect(c.id, e.target.checked)}
                    />
                    <div className={styles.main}>
                      <a href={`/player/${c.id}`} className={styles.title}>
                        {c.label || `Chapter ${c.number}`}
                      </a>
                      <div className={styles.sub}>
                        <StagePill c={c} />
                        <Progress c={c} />
                        {loadingEdit === c.id && <span className={styles.loadingDot}>loading…</span>}
                      </div>
                    </div>
                    <div className={styles.actions}>
                      {c.hasAudio ? (
                        <a href={`/player/${c.id}`} className={styles.listenBtn}>▶ Listen</a>
                      ) : c.stage === 'captured' || c.stage === 'cleaned' ? (
                        <button className={styles.generateBtn} onClick={() => onAction('audio', [c.id])}>
                          Generate
                        </button>
                      ) : c.stage === 'failed' ? (
                        <button className={styles.generateBtn} onClick={() => onAction('audio', [c.id])}>
                          Retry
                        </button>
                      ) : null}
                      <RowMenu c={c} onAction={onAction} onEditClick={() => openEditor(c)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {selected.length > 0 && (
        <div className={styles.batchBar}>
          <span className={styles.batchCount}>{selected.length} selected</span>
          <button onClick={() => onAction('read', selected)}>Mark read</button>
          <button onClick={() => onAction('unread', selected)}>Mark unread</button>
          <button onClick={() => onAction('archive', selected)}>Archive</button>
          <button onClick={() => onAction('audio', selected)}>Generate audio</button>
          <button onClick={() => onAction('download', selected)}>Download</button>
          <button className={styles.batchClear} onClick={() => chapters.forEach(c => onSelect(c.id, false))}>
            ✕
          </button>
        </div>
      )}

      {editing && (
        <EditChapterModal
          chapter={editing}
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          onSave={ch => { onEdit?.(ch as any); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default ChapterList;
