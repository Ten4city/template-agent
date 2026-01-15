/**
 * Sample Form IR
 *
 * Example of a typical Leegality-style form in IR format.
 * Used for testing the renderer.
 */

export const sampleFormIR = {
  title: 'Account Opening Form',
  metadata: {
    documentType: 'kyc-form',
    version: '1.0',
  },
  pages: [
    // Page 1 - Cover and Personal Details
    {
      pageNumber: 1,
      metadata: { pageType: 'form' },
      sections: [
        // Cover/Title
        {
          type: 'cover-block',
          title: 'Account Opening Application Form',
          subtitle: 'For Individual Customers',
          organization: 'Sample Bank Ltd.',
          version: 'Version 2.0 - January 2025',
        },

        { type: 'separator', style: 'line', size: 'large' },

        // Section 1: Personal Details Header
        {
          type: 'section-header',
          title: 'Section 1: Personal Information',
          shade: 'medium',
        },

        // Input grid - personal info
        {
          type: 'input-grid',
          columns: 4,
          rows: [
            [
              { type: 'label', text: 'Full Name', bold: true },
              { type: 'field', fieldType: 'text', name: 'full_name' },
              { type: 'label', text: 'Date of Birth', bold: true },
              { type: 'field', fieldType: 'date', name: 'dob' },
            ],
            [
              { type: 'label', text: 'Father\'s Name', bold: true },
              { type: 'field', fieldType: 'text', name: 'father_name' },
              { type: 'label', text: 'Mother\'s Name', bold: true },
              { type: 'field', fieldType: 'text', name: 'mother_name' },
            ],
            [
              { type: 'label', text: 'Gender', bold: true },
              { type: 'field', fieldType: 'radio', name: 'gender', options: ['Male', 'Female', 'Other'] },
              { type: 'label', text: 'Marital Status', bold: true },
              { type: 'field', fieldType: 'dropdown', name: 'marital_status', options: ['Single', 'Married', 'Divorced', 'Widowed'] },
            ],
            [
              { type: 'label', text: 'Email', bold: true },
              { type: 'field', fieldType: 'email', name: 'email' },
              { type: 'label', text: 'Mobile Number', bold: true },
              { type: 'field', fieldType: 'phone', name: 'mobile' },
            ],
          ],
        },

        { type: 'separator', style: 'space', size: 'medium' },

        // Photo grid
        {
          type: 'photo-grid',
          columns: 2,
          rows: [
            [
              { label: 'Applicant Photo', boxType: 'photo', width: '120px', height: '150px' },
              { label: 'Applicant Signature', boxType: 'signature', width: '200px', height: '80px' },
            ],
          ],
        },
      ],
    },

    // Page 2 - Address and KYC
    {
      pageNumber: 2,
      metadata: { pageType: 'form' },
      sections: [
        // Section 2: Address
        {
          type: 'section-header',
          title: 'Section 2: Address Details',
          shade: 'medium',
        },

        // Key-value stack for address
        {
          type: 'key-value-stack',
          pairs: [
            { label: 'Address Line 1', fieldType: 'text', name: 'address_line_1' },
            { label: 'Address Line 2', fieldType: 'text', name: 'address_line_2' },
            { label: 'City', fieldType: 'text', name: 'city' },
            { label: 'State', fieldType: 'text', name: 'state' },
            { label: 'PIN Code', fieldType: 'number', name: 'pin_code' },
          ],
        },

        { type: 'separator', style: 'space', size: 'medium' },

        // Section 3: KYC Documents
        {
          type: 'section-header',
          title: 'Section 3: KYC Documents',
          shade: 'medium',
        },

        // Checkbox matrix for document types
        {
          type: 'checkbox-matrix',
          columnHeaders: ['Submitted', 'Verified', 'Original Seen'],
          rows: [
            { label: 'Aadhaar Card', name: 'doc_aadhaar' },
            { label: 'PAN Card', name: 'doc_pan' },
            { label: 'Passport', name: 'doc_passport' },
            { label: 'Voter ID', name: 'doc_voter_id' },
            { label: 'Driving License', name: 'doc_driving_license' },
          ],
        },

        { type: 'separator', style: 'space', size: 'medium' },

        // Instructions
        {
          type: 'section-header',
          title: 'Important Instructions',
          shade: 'light',
        },

        {
          type: 'bullet-list',
          marker: 'disc',
          items: [
            { text: 'Please fill all fields in CAPITAL letters using black/blue ink.' },
            { text: 'Attach self-attested copies of all KYC documents.' },
            { text: 'Original documents must be presented for verification.' },
            { text: 'Incomplete applications will not be processed.' },
          ],
        },
      ],
    },

    // Page 3 - Nominees and Declaration
    {
      pageNumber: 3,
      metadata: { pageType: 'form' },
      sections: [
        // Section 4: Nominees
        {
          type: 'section-header',
          title: 'Section 4: Nominee Details',
          shade: 'medium',
        },

        // Repeating group for nominees
        {
          type: 'repeating-group',
          groupLabel: 'Nominee',
          repeatCount: 2,
          template: [
            {
              type: 'input-grid',
              columns: 4,
              rows: [
                [
                  { type: 'label', text: 'Nominee Name', bold: true },
                  { type: 'field', fieldType: 'text', name: 'nominee_name' },
                  { type: 'label', text: 'Relationship', bold: true },
                  { type: 'field', fieldType: 'text', name: 'nominee_relationship' },
                ],
                [
                  { type: 'label', text: 'Date of Birth', bold: true },
                  { type: 'field', fieldType: 'date', name: 'nominee_dob' },
                  { type: 'label', text: 'Share %', bold: true },
                  { type: 'field', fieldType: 'number', name: 'nominee_share' },
                ],
              ],
            },
          ],
        },

        { type: 'separator', style: 'line', size: 'medium' },

        // Declaration
        {
          type: 'section-header',
          title: 'Declaration',
          shade: 'medium',
        },

        {
          type: 'declaration-block',
          text: 'I hereby declare that the information provided above is true and correct to the best of my knowledge. I understand that any false statement may result in rejection of my application or termination of services.',
          responseType: 'both',
          checkboxLabel: 'I agree to the terms and conditions',
        },

        { type: 'separator', style: 'space', size: 'large' },

        // Signature block
        {
          type: 'signature-block',
          slots: [
            {
              role: 'Applicant',
              hasSignature: true,
              hasName: true,
              hasDate: true,
              hasPlace: true,
            },
            {
              role: 'Witness',
              hasSignature: true,
              hasName: true,
              hasDate: true,
            },
          ],
        },

        { type: 'separator', style: 'space', size: 'medium' },

        // Office use section
        {
          type: 'section-header',
          title: 'For Office Use Only',
          shade: 'dark',
        },

        {
          type: 'data-table',
          headers: ['Field', 'Value', 'Verified By'],
          rows: [
            {
              cells: [
                { text: 'Application Number' },
                { editable: true, fieldType: 'text', name: 'app_number' },
                { editable: true, fieldType: 'text', name: 'verified_by_1' },
              ],
            },
            {
              cells: [
                { text: 'Branch Code' },
                { editable: true, fieldType: 'text', name: 'branch_code' },
                { editable: true, fieldType: 'text', name: 'verified_by_2' },
              ],
            },
            {
              cells: [
                { text: 'Account Type' },
                { editable: true, fieldType: 'dropdown', name: 'account_type', options: ['Savings', 'Current', 'Fixed Deposit'] },
                { editable: true, fieldType: 'text', name: 'verified_by_3' },
              ],
            },
          ],
        },

        // Stamp block
        {
          type: 'stamp-block',
          label: 'Official Stamp',
          width: '120px',
          height: '120px',
        },
      ],
    },
  ],
};

// Example with block references (how it would look with real extraction)
export const sampleFormIRWithBlockRefs = {
  title: 'Account Opening Form',
  pages: [
    {
      pageNumber: 1,
      sections: [
        {
          type: 'section-header',
          title: 'Personal Information', // Hint for search
          blockIndex: 0, // Reference to extracted block
          shade: 'medium',
        },
        {
          type: 'input-grid',
          columns: 4,
          rows: [
            [
              { type: 'label', text: 'Full Name', blockIndex: 1 },
              { type: 'field', fieldType: 'text', name: 'full_name' },
              { type: 'label', text: 'Date of Birth', blockIndex: 2 },
              { type: 'field', fieldType: 'date', name: 'dob' },
            ],
          ],
        },
      ],
    },
  ],
};
