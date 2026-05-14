'use client'
import { useState } from 'react'
import { Case } from '@/types'
import { updateProperty } from './actions'

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const labelCls = 'text-xs text-gray-500 mb-1.5 block'

export function EditForm({ c }: { c: Case }) {
  const [address, setAddress]       = useState(c.address)
  const [ownerName, setOwnerName]   = useState(c.ownerName)
  const [phone, setPhone]           = useState(c.phone ?? '')
  const [bankName, setBankName]     = useState(c.bankName ?? '')
  const [loanAmount, setLoanAmount] = useState(c.loanAmount?.toString() ?? '')
  const [assignee, setAssignee]     = useState(c.assignee ?? '')
  const [caseNumber, setCaseNumber] = useState(c.caseNumber ?? '')
  const [notes, setNotes]           = useState(c.notes ?? '')
  const [haitoDate, setHaitoDate]   = useState(c.haitoDate ?? '')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (!address.trim()) { alert('住所を入力してください'); return }
    setSaving(true)
    await updateProperty(c.id, {
      address:      address.trim(),
      owner_name:   ownerName.trim(),
      phone:        phone.trim()      || null,
      bank_name:    bankName.trim()   || null,
      loan_amount:  loanAmount ? parseInt(loanAmount, 10) : null,
      assignee:     assignee.trim()   || null,
      case_number:  caseNumber.trim() || null,
      notes:        notes.trim()      || null,
      haito_date:   haitoDate         || null,
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <label className={labelCls}>住所 <span className="text-red-500">*</span></label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>所有者名</label>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>電話番号</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例: 075-000-0000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>担当者</label>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>事件番号</label>
          <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>金融機関</label>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>残債額（万円）</label>
          <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="例: 1500" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>配当要求日</label>
          <input type="date" value={haitoDate} onChange={(e) => setHaitoDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>備考</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        {saving ? '保存中...' : '変更を保存'}
      </button>
    </div>
  )
}
