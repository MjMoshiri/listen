import React from 'react';
import styles from './BookList.module.css';

interface Book {
  id: string;
  title: string;
}

interface BookListProps {
  books: Book[];
  onSelect: (id: string) => void;
}

const BookList: React.FC<BookListProps> = ({ books, onSelect }) => (
  <div className={styles.bookList}>
    <h2>Uploaded Books</h2>
    <ul>
      {books.map(book => (
        <li key={book.id} onClick={() => onSelect(book.id)} className={styles.bookItem}>
          {book.title}
        </li>
      ))}
    </ul>
  </div>
);

export default BookList;
