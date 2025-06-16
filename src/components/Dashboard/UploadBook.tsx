import React, { useRef } from 'react';
import styles from './UploadBook.module.css';

interface UploadBookProps {
  onUpload: (file: File) => void;
}

const UploadBook: React.FC<UploadBookProps> = ({ onUpload }) => {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <div className={styles.uploadBook}>
      <input
        type="file"
        accept=".epub"
        ref={fileInput}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button onClick={() => fileInput.current?.click()}>
        Upload New Book
      </button>
    </div>
  );
};

export default UploadBook;
