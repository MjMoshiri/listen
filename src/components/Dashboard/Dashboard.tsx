import React from 'react';
import styles from './Dashboard.module.css';

const Dashboard = ({ children }: { children?: React.ReactNode }) => (
  <div className={styles.dashboard}>{children}</div>
);

export default Dashboard;
