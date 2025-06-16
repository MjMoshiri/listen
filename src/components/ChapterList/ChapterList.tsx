import React, { useState, useEffect } from 'react';
import styles from './ChapterList.module.css';
import EditChapterModal from '../Modals/EditChapterModal';

export interface Chapter {
  id: string;
  title: string;
  cleared: boolean;
  audioGenerated: boolean;
  status: 'to-read' | 'read' | 'archived';
  text: string;
  clearedText?: string;
  label?: string;
  number?: number;
  isRead?: boolean;
  isArchived?: boolean;
}

interface ChapterListProps {
  chapters: Chapter[];
  onSelect: (id: string, selected: boolean) => void;
  selected: string[];
  onAction: (action: string, ids: string[]) => void;
  onEdit?: (chapter: Partial<Chapter>) => void;
}

const ChapterList: React.FC<ChapterListProps> = ({ chapters, onSelect, selected, onAction, onEdit }) => {
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    'to-read': false,
    'read': false,
    'archived': false,
  });
  // Group chapters by their actual status
  const grouped = {
    'to-read': chapters.filter(c => !c.isRead && !c.isArchived),
    'read': chapters.filter(c => c.isRead && !c.isArchived),
    'archived': chapters.filter(c => c.isArchived),
  };


  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const selectAllInGroup = (groupName: string, selectAll: boolean) => {
    const groupChapters = grouped[groupName as keyof typeof grouped];
    groupChapters.forEach(chapter => {
      onSelect(chapter.id, selectAll);
    });
  };

  const getSelectedCountInGroup = (groupName: string) => {
    const groupChapters = grouped[groupName as keyof typeof grouped];
    return groupChapters.filter(chapter => selected.includes(chapter.id)).length;
  };

  const handleEditClick = (chapter: Chapter) => {
    setEditingChapter(chapter);
  };

  const handleEditSave = (updatedChapter: Partial<Chapter>) => {
    if (onEdit) {
      onEdit(updatedChapter);
    }
    setEditingChapter(null);
  };  const getActionButtons = (chapter: Chapter) => {
    return (
      <div className={styles.actionButtons}>
        <button 
          className={styles.editBtn}
          onClick={() => handleEditClick(chapter)}
          title="Edit chapter text and label"
        >
          Edit
        </button>
        
        {!chapter.isRead ? (
          <button 
            className={styles.readBtn}
            onClick={() => onAction('read', [chapter.id])}
            title="Mark as read"
          >
            Mark Read
          </button>
        ) : (
          <button 
            className={styles.unreadBtn}
            onClick={() => onAction('unread', [chapter.id])}
            title="Mark as unread"
          >
            Mark Unread
          </button>
        )}
        
        {!chapter.isArchived ? (
          <button 
            className={styles.archiveBtn}
            onClick={() => onAction('archive', [chapter.id])}
            title="Archive chapter"
          >
            Archive
          </button>
        ) : (
          <button 
            className={styles.unarchiveBtn}
            onClick={() => onAction('unarchive', [chapter.id])}
            title="Unarchive chapter"
          >
            Unarchive
          </button>
        )}
        
        <button 
          className={styles.clearBtn}
          onClick={() => onAction('clear', [chapter.id])}
          disabled={chapter.cleared}
          title={chapter.cleared ? "Already cleared" : "Clean text for audio generation"}
        >
          {chapter.cleared ? 'Cleared' : 'Clear'}
        </button>
          <button 
          className={styles.audioBtn}
          onClick={() => onAction('audio', [chapter.id])}
          disabled={chapter.audioGenerated}
          title={chapter.audioGenerated ? "Audio already generated" : "Generate audio"}
        >
          {chapter.audioGenerated ? 'Audio Ready' : 'Generate Audio'}
        </button>
        
        {chapter.audioGenerated && (
          <button 
            className={styles.regenerateBtn}
            onClick={() => onAction('regenerate', [chapter.id])}
            title="Regenerate audio (will overwrite existing audio)"
          >
            Regenerate
          </button>
        )}
        
        <button 
          className={styles.downloadBtn}
          onClick={() => onAction('download', [chapter.id])}
          disabled={!chapter.audioGenerated}
          title={chapter.audioGenerated ? "Download audio file" : "No audio available"}
        >
          Download
        </button>
      </div>
    );
  };  return (
    <div className={styles.chapterList}>
      {Object.entries(grouped).map(([status, items]) => (
        items.length > 0 && (
          <div key={status} className={styles.group}>
            <div className={styles.groupHeader}>
              <h3 
                className={styles.groupTitle}
                onClick={() => toggleGroup(status)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <span className={styles.collapseIcon}>
                  {collapsedGroups[status] ? '▶' : '▼'}
                </span>
                {status.replace('-', ' ').toUpperCase()} ({items.length})
              </h3>
              
              <div className={styles.groupActions}>
                <button
                  className={styles.selectAllBtn}
                  onClick={() => {
                    const selectedInGroup = getSelectedCountInGroup(status);
                    const allSelected = selectedInGroup === items.length;
                    selectAllInGroup(status, !allSelected);
                  }}
                >
                  {getSelectedCountInGroup(status) === items.length && items.length > 0 
                    ? 'Deselect All' 
                    : `Select All (${items.length})`}
                </button>
                
                {getSelectedCountInGroup(status) > 0 && (
                  <span className={styles.selectedCount}>
                    {getSelectedCountInGroup(status)} selected
                  </span>
                )}
              </div>
            </div>
            
            {!collapsedGroups[status] && (
              <div className={styles.groupContent}>
                {items.map(chapter => (
                  <div key={chapter.id} className={styles.chapterItem}>
                    <div className={styles.chapterHeader}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selected.includes(chapter.id)}
                        onChange={e => onSelect(chapter.id, e.target.checked)}
                      />
                      <span className={styles.title}>{chapter.title}</span>
                        <div className={styles.statusIndicators}>
                        <span className={chapter.cleared ? styles.cleared : styles.notCleared}>
                          {chapter.cleared ? '✓ Cleared' : '○ Not Cleared'}
                        </span>                        <span className={chapter.audioGenerated ? styles.audio : styles.noAudio}>
                          {chapter.audioGenerated ? '🔊 Audio' : '🔇 No Audio'}
                        </span>
                      </div>
                    </div>
                    
                    {getActionButtons(chapter)}
                    
                    <details className={styles.textCollapse}>
                      <summary className={styles.summary}>Show Text</summary>
                      <div className={styles.text}>
                        {chapter.clearedText ? (
                          <div>
                            <strong>Cleaned Text:</strong>
                            <div className={styles.clearedText}>{chapter.clearedText}</div>
                            {chapter.text !== chapter.clearedText && (
                              <details style={{ marginTop: '1rem' }}>
                                <summary>Show Original Text</summary>
                                <div className={styles.originalText}>{chapter.text}</div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <div>
                            <strong>Original Text:</strong>
                            <div className={styles.unclearedText}>{chapter.text}</div>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ))}
      
      {/* Batch actions */}
      {selected.length > 0 && (
        <div className={styles.batchActions}>
          <div className={styles.batchTitle}>
            Batch Actions ({selected.length} selected)
          </div>
          <div className={styles.batchButtons}>
            <button onClick={() => onAction('read', selected)} className={styles.batchReadBtn}>
              Mark as Read
            </button>
            <button onClick={() => onAction('unread', selected)} className={styles.batchUnreadBtn}>
              Mark as Unread
            </button>
            <button onClick={() => onAction('archive', selected)} className={styles.batchArchiveBtn}>
              Archive
            </button>
            <button onClick={() => onAction('unarchive', selected)} className={styles.batchUnarchiveBtn}>
              Unarchive
            </button>
            <button onClick={() => onAction('clear', selected)} className={styles.batchClearBtn}>
              Clear Selected
            </button>            <button onClick={() => onAction('audio', selected)} className={styles.batchAudioBtn}>
              Generate Audio
            </button>
            <button onClick={() => onAction('regenerate', selected)} className={styles.batchRegenerateBtn}>
              Regenerate Audio
            </button>
            <button onClick={() => onAction('download', selected)} className={styles.batchDownloadBtn}>
              Download All
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingChapter && (
        <EditChapterModal
          chapter={editingChapter}
          isOpen={!!editingChapter}
          onClose={() => setEditingChapter(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
};

export default ChapterList;
