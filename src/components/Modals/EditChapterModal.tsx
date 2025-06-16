import React, { useState } from 'react';
import styles from './EditChapterModal.module.css';

interface Chapter {
  id: string;
  title: string;
  text: string;
  audioText?: string;
  label?: string;
}

interface EditChapterModalProps {
  chapter: Chapter;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedChapter: Partial<Chapter>) => void;
}

const EditChapterModal: React.FC<EditChapterModalProps> = ({
  chapter,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState({
    label: chapter.label || '',
    text: chapter.text || '',
    audioText: chapter.audioText || '',
  });
  const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      id: chapter.id,
      label: formData.label,
      text: formData.text,
      audioText: formData.audioText,
    });
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Edit Chapter</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.field}>
            <label>Chapter Label:</label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
              placeholder="Enter chapter label..."
            />
          </div>

          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'text' ? styles.active : ''}`}
              onClick={() => setActiveTab('text')}
            >
              Original Text
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'audio' ? styles.active : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              Audio Text
            </button>
          </div>

          <div className={styles.textArea}>
            {activeTab === 'text' ? (
              <textarea
                value={formData.text}
                onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Original chapter text..."
                rows={15}
              />
            ) : (
              <textarea
                value={formData.audioText}
                onChange={(e) => setFormData(prev => ({ ...prev, audioText: e.target.value }))}
                placeholder="Text for audio generation (cleaned/processed text)..."
                rows={15}
              />
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveButton} onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditChapterModal;
