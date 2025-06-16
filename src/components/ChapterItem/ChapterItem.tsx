import React from 'react';
import styles from './ChapterItem.module.css';

interface ChapterItemProps {
  id: string;
  title: string;
  cleared: boolean;
  audioGenerated: boolean;
  text: string;
  clearedText?: string;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onAction: (action: string, id: string) => void;
}

const ChapterItem: React.FC<ChapterItemProps> = ({
  id, title, cleared, audioGenerated, text, clearedText, selected, onSelect, onAction
}) => (
  <div className={styles.chapterItem}>
    <input
      type="checkbox"
      checked={selected}
      onChange={e => onSelect(id, e.target.checked)}
      aria-label={`Select chapter ${title}`}
    />
    <div className={styles.titleContainer}>
      <span className={styles.title}>{title}</span>
      <div className={styles.statusIndicators}>
        <span className={`${styles.statusIndicator} ${cleared ? styles.cleared : styles.notCleared}`}>
          {cleared ? 'Cleared' : 'Not Cleared'}
        </span>
        <span className={`${styles.statusIndicator} ${audioGenerated ? styles.audio : styles.noAudio}`}>
          {audioGenerated ? 'Audio' : 'No Audio'}
        </span>
      </div>
    </div>
    <div className={styles.actions}>
      <button onClick={() => onAction('edit', id)}>Edit</button>
      <button onClick={() => onAction('archive', id)}>Archive</button>
      <button onClick={() => onAction('read', id)}>Read</button>
      <button onClick={() => onAction('clear', id)}>Clear</button>
      <button onClick={() => onAction('audio', id)}>Audio</button>
      <button onClick={() => onAction('download', id)}>Download</button>
    </div>
    <div className={styles.detailsContainer}>
      <details open className={styles.details}> {/* Added open attribute */}
        <summary>Show Text</summary>
        <div className={styles.text}>
          {clearedText || text}
        </div>
      </details>
    </div>
  </div>
);

export default ChapterItem;
