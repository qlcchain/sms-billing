import { Component, OnInit, TemplateRef } from '@angular/core';
import { ActivatedRoute, Router, ChildActivationEnd } from '@angular/router';
import { NotificationService } from 'src/app/services/notification.service';
import { WalletService } from 'src/app/services/wallet.service';
import { UtilService } from 'src/app/services/util.service';
import { NodeService } from 'src/app/services/node.service';
import { AppSettingsService } from 'src/app/services/app-settings.service';
import { TranslateService } from '@ngx-translate/core';
import { AddressBookService } from 'src/app/services/address-book.service';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { timer } from 'rxjs';
import { NeoWalletService } from 'src/app/services/neo-wallet.service';
import * as QRCode from 'qrcode';
import BigNumber from 'bignumber.js';

@Component({
  selector: 'app-myneowallet',
  templateUrl: './myneowallet.component.html',
  styleUrls: ['./myneowallet.component.scss']
})
export class MyneowalletComponent implements OnInit {

  wallet = this.walletService.wallet;
  walletAccount = {
    balances: []
	};
	claimableGas = '0';

  walletHistory: any[] = [];
  pageSize = 15;
  accountBlocksCount = 0;
	maxPageSize = 200;

  reloadTimer = null;
  routerSub = null;

	addressBookEntry: any = null;
	accountMeta: any = {};
	walletId = '';
  
	modalRef: BsModalRef;
  
  qrCodeImage = null;
  
  showEditName = false;
	addressBookTempName = '';
  addressBookModel = '';
  
  isNaN = isNaN;
  
  msg1 = '';
	msg2 = '';
	msg3 = '';
	msg4 = '';
	msg5 = '';
	msgEdit1 = '';
  msgEdit2 = '';

  constructor(
		private route: ActivatedRoute,
		private router: Router,
		//private api: ApiService,
		private notifications: NotificationService,
		private walletService: WalletService,
		public neoService: NeoWalletService,
    private util: UtilService,
    private node: NodeService,
		public settings: AppSettingsService,
		//private qlcBlock: QLCBlockService,
		private trans: TranslateService,
		private notificationService: NotificationService,
		private addressBook: AddressBookService,
		private modalService: BsModalService) { }

  ngOnInit() {
    this.routerSub = this.router.events.subscribe(event => {
			if (event instanceof ChildActivationEnd) {
				this.load(); // Reload the state when navigating to itself from the transactions page
			}
		});
    this.load();
    
    this.loadLang();
  }
  
  ngOnDestroy() {
		if (this.reloadTimer) {
			this.reloadTimer.unsubscribe();
    }
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
			this.loadWallet();
		} else {
			this.reload();
		}
	}

	async reload() {
		const source = timer(200);
		this.reloadTimer =  source.subscribe(async val => {
				this.load();
		});
  }

  async loadWallet() {
    this.walletId = this.route.snapshot.params.wallet;
    if (this.walletId == undefined || this.walletId == '')
      this.walletId = this.wallet.accounts[0].accountMeta.account;

    this.walletAccount = this.wallet.neowallets.find(a => a.id === this.walletId);

    this.addressBookEntry = this.addressBook.getAccountName(this.walletId);
    this.addressBookModel = this.addressBookEntry || '';

		const balance:any = await this.neoService.getNeoScanBalance(this.walletId);
		//console.log('balance');
		//console.log(balance);
		for (const asset of balance) {
			this.walletAccount.balances[asset.asset_hash] = { 
				amount : new BigNumber(asset.amount).toFixed(),
				asset: asset.asset,
				asset_symbol: asset.asset_symbol
			}
		}
		
		console.log(this.walletAccount.balances);
		this.claimableGas = await this.neoService.getClaimAmount(this.walletId);

    const transactions = await this.neoService.getLastTransactions(this.walletId);
    this.walletHistory = transactions.entries;
    const qrCode = await QRCode.toDataURL(`${this.walletId}`);
    this.qrCodeImage = qrCode;
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
			this.addressBook.deleteAddress(this.walletId);
			this.notificationService.sendSuccess(this.msgEdit1);
			this.showEditName = false;
			return;
		}

		try {
			await this.addressBook.saveAddress(this.walletId, addressBookName);
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
  
  async claim() {
		await this.neoService.claimGas(this.walletId);
		this.loadWallet();
	}
	
	deleteWallet() {
		const existingAccountIndex = this.wallet.neowallets.findIndex(a => a.id === this.walletId);
    if (existingAccountIndex === -1) {
      return;
    }

    this.wallet.neowallets.splice(existingAccountIndex, 1);

		this.walletService.saveWalletExport();
		this.router.navigate(['myaccounts/']);
	}

}
