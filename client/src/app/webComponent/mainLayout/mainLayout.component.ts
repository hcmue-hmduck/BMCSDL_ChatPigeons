import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebarComponent/sidebarComponent.component';
import { E2eePinModalComponent } from "../e2eePinModal/e2eePinModal.component";

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, E2eePinModalComponent],
  templateUrl: './mainLayout.component.html',
  styleUrls: ['./mainLayout.component.css']
})
export class MainLayoutComponent {}
