import { Component, OnInit, TemplateRef } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { NodeService } from 'src/app/services/node.service';
import { Router, ChildActivationEnd, ActivatedRoute } from '@angular/router';
import { timer } from 'rxjs';
import { RepresentativeService } from 'src/app/services/representative.service';
import { NotificationService } from 'src/app/services/notification.service';
import { WalletService } from 'src/app/services/wallet.service';
import { UtilService } from 'src/app/services/util.service';
import { AppSettingsService } from 'src/app/services/app-settings.service';
import { QLCBlockService } from 'src/app/services/qlc-block.service';
import { TranslateService } from '@ngx-translate/core';
import BigNumber from 'bignumber.js';
import { AddressBookService } from 'src/app/services/address-book.service';
import * as QRCode from 'qrcode';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';

@Component({
  selector: 'app-myaccount',
  templateUrl: './myaccount.component.html',
  styleUrls: ['./myaccount.component.scss']
})
export class MyaccountComponent implements OnInit {

  wallet = this.walletService.wallet;

  accountHistory: any[] = [];
	pendingBlocks = [];
	pageSize = 5;
	maxPageSize = 200;

  routerSub = null;

  repLabel: any = '';
	addressBookEntry: any = null;
	accountMeta: any = {};
	accountId = '';

  walletAccount = null;
  
	modalRef: BsModalRef;
  
  qrCodeImage = null;
  
  showEditName = false;
	addressBookTempName = '';
	addressBookModel = '';
	showEditRepresentative = false;
	representativeModel = '';
	//representativeResults$ = new BehaviorSubject([]);
	showRepresentatives = false;
	representativeListMatch = '';
  isNaN = isNaN;
  
  msg1 = '';
	msg2 = '';
	msg3 = '';
	msg4 = '';
	msg5 = '';
	msgEdit1 = '';
	msgEdit2 = '';

  constructor(
		private router: ActivatedRoute,
		private route: Router,
		private api: ApiService,
		private repService: RepresentativeService,
		private notifications: NotificationService,
		private walletService: WalletService,
    private util: UtilService,
    private node: NodeService,
		public settings: AppSettingsService,
		private qlcBlock: QLCBlockService,
		private trans: TranslateService,
		private notificationService: NotificationService,
		private addressBook: AddressBookService,
		private modalService: BsModalService
  ) { }

  async ngOnInit() {
    this.routerSub = this.route.events.subscribe(event => {
			if (event instanceof ChildActivationEnd) {
				this.load(); // Reload the state when navigating to itself from the transactions page
			}
		});
		this.load();
  }
  
  ngOnDestroy() {
		if (this.routerSub) {
			this.routerSub.unsubscribe();
		}
  }
  
  loadLang() {
		this.trans.get('RECEIVE_WARNINGS.msg1').subscribe((res: string) => { this.msg1 = res;	});
		this.trans.get('RECEIVE_WARNINGS.msg2').subscribe((res: string) => { this.msg2 = res;	});
		this.trans.get('RECEIVE_WARNINGS.msg3').subscribe((res: string) => { this.msg3 = res;	});
		this.trans.get('RECEIVE_WARNINGS.msg4').subscribe((res: string) => { this.msg4 = res;	});
		this.trans.get('RECEIVE_WARNINGS.msg5').subscribe((res: string) => { this.msg5 = res;	});
		this.trans.get('ACCOUNT_DETAILS_WARNINGS.msg5').subscribe((res: string) => {	this.msgEdit1 = res; });
		this.trans.get('ACCOUNT_DETAILS_WARNINGS.msg6').subscribe((res: string) => {	this.msgEdit2 = res; });
	}

	load() {
		if (this.node.status === true) {
			this.loadAccount();
		} else {
			this.reload();
		}
	}

	async reload() {
		const source = timer(200);
		const abc =  source.subscribe(async val => {
				this.load();
		});
  }
  
  async loadAccount() {
    this.pendingBlocks = [];
    this.accountId = this.router.snapshot.params.account;
    if (this.accountId == undefined || this.accountId == '')
      this.accountId = this.wallet.accounts[0].accountMeta.account;

    this.addressBookEntry = this.addressBook.getAccountName(this.accountId);
		this.addressBookModel = this.addressBookEntry || '';
    console.log(this.wallet);
    console.log(this.accountId);
		const tokenMap = {};
		const tokens = await this.api.tokens();
		if (!tokens.error) {
			tokens.result.forEach(token => {
				tokenMap[token.tokenId] = token;
			});
		}

		// fill account meta
		const accountInfo = await this.api.accountInfo(this.accountId);
		if (!accountInfo.error) {
			const am = accountInfo.result;
			for (const token of am.tokens) {
				if (tokenMap.hasOwnProperty(token.type)) {
					token.tokenInfo = tokenMap[token.type];
				}
			}
			this.accountMeta = am;
    }
    
    let accountMeta = [];
    if (accountInfo.result && accountInfo.result.tokens && Array.isArray(accountInfo.result.tokens)) {
      accountInfo.result.tokens.forEach(token => {
        accountMeta[token.tokenName] = token;
      });
    }
    this.accountMeta.balances = accountMeta;

		if (this.accountMeta && this.accountMeta.tokens) {
			this.repLabel = null;
			const filter = this.accountMeta.tokens.filter(token => {
				return token.type === this.api.qlcTokenHash;
			});
			if (filter.length > 0) {
				const knownRepresentative = this.repService.getRepresentative(filter.rep);
				this.repLabel = knownRepresentative ? knownRepresentative.name : null;
			}
		}

		// If there is a pending balance, or the account is not opened yet, load pending transactions
		// if ((!this.accountMeta.error && this.accountMeta.pending > 0) || this.accountMeta.error) {
		const accountPending = await this.api.accountsPending([this.accountId], 25);
		if (!accountPending.error && accountPending.result) {
			const pendingResult = accountPending.result;

			for (const account in pendingResult) {
				if (!pendingResult.hasOwnProperty(account)) {
					continue;
				}
				pendingResult[account].forEach(pending => {
					this.pendingBlocks.push({
						account: pending.source,
						amount: pending.amount,
						token: pending.tokenName,
						// TODO: fill timestamp
						// timestamp: accountPending.blocks[block].timestamp,
						hash: pending.hash
					});
				});
			}
		}
		// }

		// If the account doesnt exist, set the pending balance manually
		if (this.accountMeta.error) {
			const pendingRaw = this.pendingBlocks.reduce(
				(prev: BigNumber, current: any) => prev.plus(new BigNumber(current.amount)),
				new BigNumber(0)
			);
			this.accountMeta.pending = pendingRaw;
		}

		await this.getAccountHistory(this.accountId);

    const qrCode = await QRCode.toDataURL(`${this.accountId}`);
		this.qrCodeImage = qrCode;
  }


  async getAccountHistory(account, resetPage = true) {
		if (resetPage) {
			this.pageSize = 25;
		}
		const accountHistory = await this.api.accountHistory(account, this.pageSize);
		// const additionalBlocksInfo = [];

		this.accountHistory = [];
		if (!accountHistory.error) {
			const historyResult = accountHistory.result;
			for (const block of historyResult) {
				// For Open and receive blocks, we need to look up block info to get originating account
				if (block.type === 'Open' || block.type === 'Receive') {
					const preBlock = await this.api.blocksInfo([block.link]);
					if (!preBlock.error) {
						block.link_as_account = preBlock.result[0].address;
					}
				} else {
					block.link_as_account = this.util.account.getPublicAccountID(this.util.hex.toUint8(block.link));
				}
				this.accountHistory.push(block);
			}
			this.accountHistory = this.accountHistory.filter(h => h.type !== 'Change');
		}
  }
  
  async receivePending(pendingBlock) {
		const sendBlock = pendingBlock.block;
		if (!sendBlock) return;
		const walletAccount = await this.walletService.getWalletAccount(pendingBlock.account);
		if (!walletAccount) {
			throw new Error(this.msg1);
		}

		if (this.walletService.walletIsLocked()) {
			return this.notificationService.sendWarning(this.msg2);
		}
		pendingBlock.loading = true;

		const newBlock = await this.qlcBlock.generateReceive(walletAccount, sendBlock, this.walletService.isLedgerWallet());
		// console.log('receive block hash >>> ' + newBlock);
		if (newBlock) {
			this.notificationService.sendSuccess(this.msg3 + ` ` + pendingBlock.tokenName);
		} else {
			if (!this.walletService.isLedgerWallet()) {
				this.notificationService.sendError(this.msg4);
			}
		}

		pendingBlock.loading = false;

		await this.walletService.reloadBalances();
		//await this.loadPendingForAll();
  }

  editName() {
		this.showEditName = true;
		this.addressBookTempName = this.addressBookModel;
	}
	editNameCancel() {
		this.showEditName = false;
		this.addressBookModel = this.addressBookTempName;
		this.addressBookTempName = '';
	}
	async editNameSave() {
		const addressBookName = this.addressBookModel.trim();
		if (!addressBookName) {
			this.addressBook.deleteAddress(this.accountId);
			this.notificationService.sendSuccess(this.msgEdit1);
			this.showEditName = false;
			return;
		}

		try {
			await this.addressBook.saveAddress(this.accountId, addressBookName);
		} catch (err) {
			this.notificationService.sendError(err.message);
			return;
		}

		this.notificationService.sendSuccess(this.msgEdit2);
		this.showEditName = false;
  }
  
  openModal(template: TemplateRef<any>) {
		this.modalRef = this.modalService.show(template);
	}

}
