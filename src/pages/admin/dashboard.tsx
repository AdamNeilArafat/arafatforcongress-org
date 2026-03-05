import React from 'react';
import AdminUploadPage from './upload';
import { loadUploadedRows } from '../../lib/csv/storage';
import { buildUploadReport } from '../../lib/csv/report';

function TeamLeadsPage() {
  const rows = loadUploadedRows();
  const report = buildUploadReport(rows);

  return (
    <section>
      <h2>Admin · Team Leads Report</h2>
      <p>
        Uploaded records: <strong>{report.totalRecords}</strong> · Unique addresses mapped: <strong>{report.totalAddresses}</strong> ·
        Addresses without volunteer interest: <strong>{report.addressesNeedingFollowUp}</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Address</th>
            <th>Residents</th>
            <th>Volunteer Signals</th>
          </tr>
        </thead>
        <tbody>
          {report.addressRows.slice(0, 20).map((row) => (
            <tr key={row.address}>
              <td>{row.address}</td>
              <td>{row.residents}</td>
              <td>{row.volunteers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function VolunteerPage() {
  const rows = loadUploadedRows();
  const report = buildUploadReport(rows);
  const households = report.addressRows.filter((row) => row.volunteers === 0).slice(0, 10);

  return (
    <section>
      <h2>Volunteer Page</h2>
      <p>Priority households mapped per address from uploaded data.</p>
      <ul>
        {households.length === 0 ? <li>No addresses pending follow-up.</li> : null}
        {households.map((home) => (
          <li key={home.address}>
            {home.address} ({home.residents} residents)
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [page, setPage] = React.useState<'admin' | 'team-leads' | 'volunteer'>('admin');

  return (
    <main>
      <h1>Operations Dashboard</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setPage('admin')}>Admin Upload</button>
        <button onClick={() => setPage('team-leads')}>Admin Team Leads</button>
        <button onClick={() => setPage('volunteer')}>Volunteer</button>
      </nav>

      {page === 'admin' ? <AdminUploadPage /> : null}
      {page === 'team-leads' ? <TeamLeadsPage /> : null}
      {page === 'volunteer' ? <VolunteerPage /> : null}
    </main>
  );
}
