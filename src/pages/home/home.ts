import { Component, ViewChild} from '@angular/core';
import { App, NavController, NavParams, ViewController, ActionSheetController, AlertController, Platform, ModalController, Slides} from 'ionic-angular';

import { App as AppConfig } from '../../providers/app/app';
import { WalletProvider } from '../../providers/wallet/wallet';
import { UtilitiesProvider } from '../../providers/utilities/utilities';
import { GetBalanceProvider } from '../../providers/get-balance/get-balance';
import { AlertProvider } from '../../providers/alert/alert';

import { NemProvider } from '../../providers/nem/nem';
import { HapticProvider } from '../../providers/haptic/haptic';


import { GetMarketPricePipe } from '../../pipes/get-market-price/get-market-price';
import { TranslateService } from '@ngx-translate/core';
import { SimpleWallet, Mosaic, Password, Account, Address, UInt64, Wallet, AccountInfo, TransactionType, Transaction } from 'tsjs-xpx-chain-sdk';
import { AuthProvider } from '../../providers/auth/auth';
import { MosaicsProvider } from '../../providers/mosaics/mosaics';
import { TransactionsProvider } from '../../providers/transactions/transactions';
import { Observable } from 'rxjs';
import {animate, style, transition, trigger} from "@angular/animations";


export enum WalletCreationType {
  NEW = 0,
  IMPORT = 1
}

@Component({
  selector: 'page-home',
  templateUrl: 'home.html',
  animations: [
    trigger('itemState', [
      transition('void => *', [
        style({ transform: 'translateX(-100%)' }),
        animate('250ms ease-out')
      ]),
      transition('* => void', [
        animate('250ms ease-in', style({ transform: 'translateX(100%)' }))
      ])
    ])
  ],
  providers: [GetMarketPricePipe]
})
export class HomePage {
  @ViewChild(Slides) slides: Slides;

  menu = 'mosaics';
  AppConfig = AppConfig;

  mosaics: Array<any>;
  wallets: SimpleWallet[];

  fakeList: Array<any>;
  data: any[] = [];
  totalWalletBalance = 0;

  /** Transaction list member variables */
  App = App;
  TransactionType = TransactionType;

  unconfirmedTransactions: Array<Transaction>;
  confirmedTransactions: Array<any>;
  showEmptyTransaction: boolean = false;
  showEmptyMosaic: boolean = false;
  isLoading: boolean = false;


  tablet: boolean;

  selectedWallet: SimpleWallet;
  selectedAccount: Account;
  accountInfo: AccountInfo;
  selectedMosaic: Mosaic;

  constructor(
    public app: App,
    public navCtrl: NavController,
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public getBalanceProvider: GetBalanceProvider,
    public alertProvider: AlertProvider,
    public walletProvider: WalletProvider,
    public utils: UtilitiesProvider,
    public actionSheetCtrl: ActionSheetController,
    public alertCtrl: AlertController,
    public platform: Platform,
    private modalCtrl: ModalController,
    private haptic: HapticProvider,
    private marketPrice: GetMarketPricePipe,
    private translateService: TranslateService,
    private authProvider: AuthProvider,
    public mosaicsProvider: MosaicsProvider,
    private transactionsProvider: TransactionsProvider
  ) {
    this.totalWalletBalance = 0;
    this.menu = "mosaics";

    if (window.screen.width >= 768) { // 768px portrait
      this.tablet = true;
    }
   
  }
  ionViewDidEnter() {
	console.log("LOG: HomePage -> ionViewDidEnter -> ionViewDidEnter");
  }

  ionViewWillEnter() {
    console.log("1 ionViewWillEnter");
    this.utils.setHardwareBack();
    this.init();
  }

  private init() {

    this.showLoaders();
    
    this.walletProvider.getWallets().then(wallets => {

      this.wallets = this.walletProvider.convertToSimpleWallets(wallets);
      console.log("1. LOG: HomePage -> ionViewWillEnter -> this.wallets", this.wallets);

      if (this.wallets.length > 0) {

        this.walletProvider.getSelectedWallet().then(selectedWallet  => {
          console.log("2. Selected wallet:", selectedWallet);

          this.selectedWallet = selectedWallet ? selectedWallet : wallets[0];
          console.log("3. LOG: HomePage -> ionViewWillEnter -> myWallet", this.selectedWallet);

          this.getAccount(selectedWallet).subscribe(account=>{
            console.log("4. LOG: HomePage -> ionViewWillEnter -> account", account);
            this.selectedAccount = account;
          
            try {
              this.getAccountInfo(account).subscribe(accountInfo=> {
                  console.log("5. LOG: HomePage -> ionViewWillEnter -> accountInfo", accountInfo);

                  // Load default mosaics
                  const myAssets = this.loadDefaultMosaics();
                  console.log("6. LOG: HomePage -> loadDefaultMosaics()")
                  myAssets.subscribe(mosaics=> {
                      this.mosaics = mosaics;
                      this.isLoading = false;

                       // Update asset info
                      console.log("7. LOG: HomePage -> updateAssetsInfo", accountInfo)
                      this.updateAssetsInfo(accountInfo);


                      // Compute wallet balance in USD
                      console.log("8. LOG: HomePage -> getWalletBalanceInUSD -> mosaics", mosaics)
                      this.getWalletBalanceInUSD(mosaics).then(total=>{
                        this.totalWalletBalance = total as number;
                        console.log("SIRIUS CHAIN WALLET: HomePage -> init -> total", total)
                      })

        
                      // Show Transactions
                      console.log("9. LOG: HomePage -> getTransactions -> selectedWallet", selectedWallet);
                      this.getTransactions(selectedWallet, account);
                      this.hideLoaders();
                  })
              })
            } catch (error) {
              this.showEmptyMessage();
            }
          })
        })
        this.hideEmptyMessage();
      } else {
        this.showEmptyMessage();
      }
      this.hideLoaders();
    });
  }
  showEmptyMessage() {
    this.mosaics = null;
    this.confirmedTransactions = null;
    this.unconfirmedTransactions = null;
    this.showEmptyMosaic = true;
    this.showEmptyTransaction = true;
  }
  hideEmptyMessage() {
    this.showEmptyMosaic = false;
    this.showEmptyTransaction = false;
  }
  hideLoaders() {
    this.isLoading = false;
  }
  showLoaders() {
    // Loaders
    this.fakeList = [{}, {}];
    this.isLoading = true;
    this.showEmptyTransaction = true;
    this.showEmptyMosaic = true;

    this.unconfirmedTransactions = null;
    this.confirmedTransactions = null
    
    // TODO: (Temporary) False if there is transaction
    // this.showEmptyTransaction = true;;
  }

  getWalletBalanceInUSD(mosaics: Array<any>) {
    return new Promise((resolve) => {

      function getSum(total, num) {
        return total + num;
      }

      const mosaicsAmountInUSD = mosaics.map(async (mosaic) => {
        const price = await this.mosaicsProvider.getCoinPrice(mosaic.mosaicId);
        return price * mosaic.amount;
      })
      
      Promise.all(mosaicsAmountInUSD).then(function(pricesArray) {
      console.log("SIRIUS CHAIN WALLET: HomePage -> getWalletBalanceInUSD -> results", pricesArray)
        const sum = pricesArray.reduce(getSum);
        console.log("SIRIUS CHAIN WALLET: HomePage -> getWalletBalanceInUSD -> sum", sum)
        resolve(sum);
      })
    })
  }

  loadDefaultMosaics() {
    // this.isLoading = true;
    // this.mosaics = null; // Triggers the skeleton list loader
    return this.mosaicsProvider.mosaics();
  }

  private updateAssetsInfo(accountInfo: AccountInfo) {
    accountInfo.mosaics.forEach(mosaic => {
      const mosaicInfo = this.mosaicsProvider.setMosaicInfo(mosaic);
      // console.log("6. LOG: HomePage -> updateDefaultMosaics -> mosaicInfo", mosaicInfo);
    });
  }

  

  private getAccount(wallet: SimpleWallet) : Observable<Account> {
    return new Observable(observer => {
      // Get user's password and unlock the wallet to get the account
     this.authProvider
     .getPassword()
     .then(password => {
       // Get user's password
       const myPassword = new Password(password);

       // Convert current wallet to SimpleWallet
       const myWallet = this.walletProvider.convertToSimpleWallet(wallet)

       // Unlock wallet to get an account using user's password 
       const account = myWallet.open(myPassword);

       observer.next(account);
     
      });

    });
  }

  private getAccountInfo(account: Account) : Observable<AccountInfo>{
    return new Observable(observer => {
      const accountInfo = this.walletProvider.getAccountInfo(account.address.plain());
        accountInfo.subscribe(accountInfo => {
        observer.next(accountInfo);
    });

    })
    
  }

  

  computeTotalWalletBalance(wallets: any) {
    console.log("2 computeTotalWalletBalance");
    wallets.map((wallet, index) => {
      this.getBalanceProvider.totalBalance(wallet).then(total => {
        if (wallet.name == this.selectedWallet.name) {
          this.slides.slideTo(index);
        }
        wallet.total = total;
        return wallet;
      })
    })
  }

  getTransactions(selectedWallet: SimpleWallet, account: Account) {
    this.isLoading = true;

    this.transactionsProvider.getAllTransactionsFromAccount(account.publicAccount).subscribe(transactions=> {
      if(transactions) {
        const transferTransactions: Array<Transaction> = transactions.filter(tx=> tx.type== TransactionType.TRANSFER)
        // console.log("8. LOG: HomePage -> getTransactions -> transferTransactions", transferTransactions);
        this.confirmedTransactions = transferTransactions;
        this.showEmptyTransaction = false;
      } else {
        this.showEmptyTransaction = true
      }

    });


    this.isLoading = false;
  }

  onWalletSelect(wallet) {
    console.log("LOG: HomePage -> onWalletSelect -> wallet", wallet);
    this.selectedWallet = wallet;
    this.walletProvider.setSelectedWallet(this.selectedWallet).then(() => {
      this.init();

      this.menu = "mosaics";
    });
  }

  showWalletDetails() {
    let page = 'TransactionListPage';
    let wallet = this.selectedWallet
    wallet.walletColor = this.wallets[this.slides._activeIndex].walletColor;
    const modal = this.modalCtrl.create(page, wallet, {
      enableBackdropDismiss: false,
      showBackdrop: true
    });
    modal.present();
  }

  onWalletPress(wallet) {
    this.haptic.impact({ style: 'heavy' });

    this.selectedWallet = wallet;

    let editButton = this.translateService.instant("WALLETS.EDIT");
    let deleteButton = this.translateService.instant("WALLETS.DELETE");
    let cancelButton = this.translateService.instant("WALLETS.BUTTON.CANCEL");

    const actionSheet = this.actionSheetCtrl.create({
      title: ``,
      cssClass: 'wallet-on-press',
      buttons: [
        {
          text: editButton,
          icon: this.platform.is('ios') ? null : 'create',
          handler: () => {
            this.navCtrl.push('WalletUpdatePage', { wallet: wallet });
          }
        },
        {
          text: deleteButton,
          role: 'destructive',
          icon: this.platform.is('ios') ? null : 'trash',
          handler: () => {
            let page = "WalletDeletePage";
            this.showModal(page, { wallet: wallet });
          }
        },
        {
          text: cancelButton,
          role: 'cancel',
          icon: this.platform.is('ios') ? null : 'close',
          handler: () => {
            console.log('Cancel clicked');
          }
        }
      ]
    });
    actionSheet.present();
  }

  showAddWalletPrompt() {
    this.haptic.selection();

    let alert = this.alertCtrl.create();
    const alertTitle = this.translateService.instant("WALLETS.CREATE.NEW");
    alert.setTitle(alertTitle);
    alert.setSubTitle('');

    let newWalletButton = this.translateService.instant("WALLETS.CREATE.NEW");
    let importWalletButton = this.translateService.instant("WALLETS.CREATE.IMPORT");

    alert.addInput({
      type: 'radio',
      label: newWalletButton,
      value: WalletCreationType.NEW.toString(),
      checked: true
    });

    alert.addInput({
      type: 'radio',
      label: importWalletButton,
      value: WalletCreationType.IMPORT.toString(),
      checked: false
    });
    const cancelButtonText = this.translateService.instant("WALLETS.BUTTON.CANCEL");
    const continueButtonText = this.translateService.instant("WALLETS.BUTTON.CONTINUE");
    alert.addButton(cancelButtonText);

    alert.addButton({
      text: continueButtonText,
      handler: data => {
        if (data === WalletCreationType.NEW.toString()) {
          this.navCtrl.push('WalletAddPage');
        } else if (data === WalletCreationType.IMPORT.toString()) {
          this.navCtrl.push("WalletAddPrivateKeyPage", {
            name: "",
            privateKey: ""
          });
        }
      }
    });

    alert.present();
  }

  public gotoWalletList() {
    this.utils.setRoot('TabsPage');
  }

  public gotoCoinPrice(mosaic) {
	console.log("LOG: HomePage -> publicgotoCoinPrice -> mosaic", mosaic);

    let coinId:string;

    if (mosaic.mosaicId.name === 'xem') {
      coinId = 'nem';
    }
    else if (mosaic.mosaicId.name === 'xpx') {
      coinId = 'proximax';
    } else if (mosaic.mosaicId.name === 'npxs') {
      coinId = 'pundi-x';
    } else {
      coinId = '';
    }

    this.marketPrice.transform(mosaic.mosaicId.name).then(price=>{
			console.log("LOG: HomePage -> publicgotoCoinPrice -> price", price);
      
      let totalBalance = mosaic.amount * price;
			console.log("LOG: HomePage -> publicgotoCoinPrice -> totalBalance", totalBalance);
    
      let page = "CoinPriceChartPage";
      const modal = this.modalCtrl.create(page, { 
        mosaicId: mosaic.mosaicId.name, 
        coinId: coinId, 
        currentWallet: this.selectedWallet, 
        mosaicAmount: mosaic.amount,
        totalBalance: totalBalance
      }, {
        enableBackdropDismiss: false,
        showBackdrop: true
      });
      modal.present();
  })
  }

  public getPriceInUSD(amount, marketPrice) {
    let result = amount * marketPrice;
    this.totalWalletBalance += result

    return result;
  }

  /** Transaction list methods */
  trackByHash(index) {
    return index;
  }

  gotoTransactionDetail(tx) {
    let page = "TransactionDetailPage";
    this.showModal(page, tx);
  }

  showReceiveModal() {
    let page = "ReceivePage";

    this.showModal(page, {});
  }

  showModal(page, params) {
    const modal = this.modalCtrl.create(page, params, {
      enableBackdropDismiss: false,
      showBackdrop: true
    });
    modal.present();
  }

  doRefresh(refresher) {
    console.log('Begin async operation', refresher);

    setTimeout(async () => {
      this.mosaics = null; // Triggers the skeleton list loader
      console.log('Async operation has ended');
      try {
        await this.computeTotalWalletBalance(this.wallets);
        // await this.getMosaicBalance(this.selectedWallet);
        // await this.getTransactions(this.selectedWallet);
        refresher.complete();
      } catch (error) {
        this.isLoading = false;
        refresher.complete();
      }
    }, 2000);
  }

   getBalanceOfSelectedWallet() {
    // if(this.selectedWallet) {
    //   return (  this.wallets.filter(wallet => wallet.name == this.selectedWallet.name)[0].total);
    // }
    // Todo: Compute total balance
    return 0;
  }
}

