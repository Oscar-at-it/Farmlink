import { kes } from '../api.js';
import { useAuth } from '../auth.jsx';

// The till slip. Shown after a sale and printed with the browser's Print dialog.
export default function Receipt({ sale, customerName, onNew }) {
  const { business } = useAuth();
  const p = sale.payment;
  return (
    <div className="overlay" role="dialog" aria-label="Receipt">
      <div className="slip-wrap">
        <div className="slip" id="receipt">
          <div className="slip__head">
            <strong>{business?.name || 'Receipt'}</strong>
            {business?.address && <span>{business.address}</span>}
            {business?.phone && <span>Tel {business.phone}</span>}
            <span>{new Date(sale.createdAt).toLocaleString('en-KE')}</span>
            <span>{sale.pending ? 'Receipt pending' : `Receipt ${sale.receiptNo}`}</span>
          </div>
          <table>
            <tbody>
              {sale.items.map((i, k) => (
                <tr key={k}>
                  <td>{i.productName}<small>{i.qty} {i.unit} × {kes(i.unitPrice)}</small></td>
                  <td className="num">{kes(i.lineRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl>
            <div className="total"><dt>Total</dt><dd>{kes(sale.totalRevenue)}</dd></div>
            <div><dt>Paid ({p.method === 'mpesa' ? 'M-Pesa' : p.method})</dt><dd>{kes(p.amountPaid)}</dd></div>
            {p.change > 0 && <div><dt>Change</dt><dd>{kes(p.change)}</dd></div>}
            {p.balanceOwed > 0 && <div className="owed"><dt>Balance owed</dt><dd>{kes(p.balanceOwed)}</dd></div>}
            {p.mpesaCode && <div><dt>M-Pesa code</dt><dd>{p.mpesaCode}</dd></div>}
            {customerName && <div><dt>Customer</dt><dd>{customerName}</dd></div>}
          </dl>
          {sale.pending && <p className="slip__foot">Saved on this device. It will be sent to the server when you are back online.</p>}
          <p className="slip__foot">Thank you for shopping with us.</p>
        </div>
        <div className="slip-actions">
          <button className="btn btn--ghost-light" onClick={() => window.print()}>Print receipt</button>
          <button className="btn btn--primary" onClick={onNew} autoFocus>Start new sale</button>
        </div>
      </div>
    </div>
  );
}
