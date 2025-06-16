import React from 'react';
import styles from './BookPage.module.css';

const BookPage = ({ children }: { children?: React.ReactNode }) => (
  <div className={styles.bookPage}>{children}</div>
);

export default BookPage;
