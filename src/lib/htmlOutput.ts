import {Transaction} from "./types";

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Month is zero-indexed, so add 1
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    // Add leading zeroes to ensure two digits for each value
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');

    return `${year}-${formattedMonth}-${formattedDay} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

function formatDateMonthAndYearOnly(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Month is zero-indexed, so add 1

    // Add leading zeroes to ensure two digits for each value
    const formattedMonth = month.toString().padStart(2, '0');

    return `${year}-${formattedMonth}`;
}

export function generateTransactionHtmlTable(data: Transaction[]): string {
    let tableHTML = `<style>
                            /* Set font family and size for the entire document */
                            body {
                              font-family: "Helvetica", Arial, sans-serif;
                              font-size: 16px;
                              line-height: 1.5;
                            }
                            
                            /* Add some padding and margin to the table */
                            table {
                              padding: 20px;
                              margin: 20px auto;
                              border-collapse: collapse;
                            }
                            
                            /* Add a border to the table and table cells */
                            table, th, td {
                              border: 1px solid #ccc;
                            }
                            
                            /* Style the table header */
                            th {
                              background-color: #eee;
                              text-align: left;
                              padding: 10px;
                            }
                            
                            /* Style the table cells */
                            td {
                              padding: 10px;
                            }
                            
                            /* Set a different background color for every other table row */
                            tr:nth-child(even) {
                              background-color: #f9f9f9;
                            }
                            
                            /* Style the table caption */
                            caption {
                              font-size: 20px;
                              font-weight: bold;
                              text-align: center;
                              margin-bottom: 20px;
                            }
                      </style>
                      <table>
                      <thead>
                          <tr>
                               <th colspan="6">Transactions of ${data.length > 0 ? data[0].to : ''}</th>
                          </tr>
                          <tr>
                              <th>Timestamp</th>
                              <th>From/To</th>
                              <th>From/To (address)</th>
                              <!--<th>To</th>-->
                              <th>Value (CRC)</th>
                              <th>Value (TC)</th>
                              <th>Total demurrage in month (TC)</th>
                          </tr>
                      </thead>
                      <tbody>`;

    for (const row of data) {
        if (parseFloat(row.monthly_tc_demur) > 0) {
            tableHTML += `
            <tr>
              <td colspan="5">${formatDateMonthAndYearOnly(row.timestamp)}</td>
              <td>${parseFloat(row.monthly_tc_demur).toFixed(3)}</td>
            </tr>`;
        } else {
            tableHTML += `
            <tr>
              <td>${formatDate(row.timestamp)}</td>
              <td>
                ${row.fromProfile?.avatarUrl
                ? `<img style="width:32px; height:32px;" width="32" height="32" src="${row.fromProfile.avatarUrl}" alt="${row.fromProfile?.username}">`
                : `<img style="width:32px; height:32px;" width="32" height="32" src="">`} ${row.fromProfile?.username}
              </td>
              <td>${row.from}</td>
              <!--<td>${row.to}</td>-->
              <td style="color:${parseFloat(row.crc) >= 0 ? 'black' : 'red'}">${parseFloat(row.crc).toFixed(3)}</td>
              <td style="color:${parseFloat(row.crc) >= 0 ? 'black' : 'red'}">${parseFloat(row.tc).toFixed(3)}</td>
              <td></td>
            </tr>`;
        }
    }
    tableHTML += `</tbody></table>`;
    return tableHTML;
}
