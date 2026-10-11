import { useState } from 'react';
import { kes } from '../api.js';
import { outbox, retrySale, syncOutbox, useOnline, useOutbox } from '../offline.js';
import Modal from './Modal.jsx';

export default function SyncStatus() {
  const online = useOnline();
  const list = useOutbox();
  const [open, setOpen] = useState(false);
  const failed = list.filter(e => e.status === 'failed');
  const waiting = list.length - failed.length;

  if (online && !list.length) return null;
  const text = failed.length ? `${failed.length} sale${failed.length > 1 ? 's' : ''} need attention`
    : waiting ? `${waiting} sale${waiting > 1 ? 's' : ''} waiting to send`
    : 'Offline';
  const tone = failed.length ? 'red' : !online ? 'amber' : 'green';

  return (
    <>
      <button className={`syncpill syncpill--${tone}`} onClick={() => setOpen(true)} title="Sales saved on this device">
        {!online && waiting === 0 && !failed.length ? 'Offline' : <>{!online && 'Offline · '}{text}</>}
      </button>
      {open && (
        <Modal title="Sales saved on this device" onClose={() => setOpen(false)} wide>
          <div className="form">
            <p className="hint span2">{online ? 'You are online. Sales are sent automatically.' : 'You are offline. Sales will be sent automatically when the connection returns.'}</p>
            {!list.length && <p className="span2 empty">Nothing is waiting. Every sale has been sent.</p>}
            <ul className="outbox span2">
              {list.map(e => (
                <li key={e.clientId} className={e.status === 'failed' ? 'is-failed' : ''}>
                  <div>
                    <strong>{kes(e.total)}</strong> · {new Date(e.soldAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    <small>{e.label}</small>
                    {e.status === 'failed' && <small className="err">Could not be saved: {e.error}. Fix the cause (for example restock), then retry, or discard the sale.</small>}
                  </div>
                  {e.status === 'failed' && (
                    <div className="acts">
                      <button className="btn btn--sm" onClick={() => retrySale(e.clientId)}>Retry</button>
                      <button className="btn btn--sm btn--ghost" onClick={() => { if (window.confirm('Discard this sale? It was never recorded and stock was not reduced.')) outbox.remove(e.clientId); }}>Discard</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <footer className="span2">
              <button className="btn btn--ghost" onClick={() => setOpen(false)}>Close</button>
              <button className="btn btn--primary" disabled={!online || !waiting} onClick={() => syncOutbox()}>Send now</button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
